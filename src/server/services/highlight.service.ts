import { readFile } from "node:fs/promises";

import { Prisma } from "@prisma/client";

import { generateScriptPattern, selectEngagingSegments, type EngagingSegment } from "@/lib/clients/anthropic";
import { buildVideoSegmentClip, extractAudioTrack, extractVideoFrame } from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { ensureProjectDir, resolveProjectFilePath } from "@/lib/storage";
import { resolveThumbnailResolution } from "@/lib/thumbnail";
import { formatCuesForPrompt, parseTranscript, retimeCuesToTimeline, type TranscriptCue } from "@/lib/transcript";
import { resolveVideoResolution } from "@/lib/video";
import { downloadVideoSection, fetchAutoSubtitles } from "@/lib/ytdlp";
import { ensureAutoTrack, getOrSyncTimeline } from "@/server/services/timeline.service";

// 영상 형태별 기본 목표 길이(초). 사용자가 targetDurationSec로 덮어쓸 수 있다.
const DEFAULT_TARGET_SEC: Record<"SHORT" | "LONG", number> = { SHORT: 45, LONG: 180 };

type SourceVideo = { videoId: string; url: string; title: string };

export type AnalyzeHighlightsInput = {
  manualTranscript?: string;
  targetDurationSec?: number;
};

export type HighlightAnalysisResult = {
  transcriptSource: "manual" | "auto-subtitle";
  cueCount: number;
  targetDurationSec: number;
  segments: EngagingSegment[];
};

// PROJECT_SPEC.md §2.5 "채널 분석 → 프로젝트 (Phase 2)": 자막을 확보(수동 우선, 없으면 자동자막)해 파싱하고
// AI로 흥미 구간을 선정한 뒤 프로젝트 settings.highlightSegments에 저장한다.
export async function analyzeProjectHighlights(
  projectId: string,
  input: AnalyzeHighlightsInput,
): Promise<HighlightAnalysisResult> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const settings = (project.settings && typeof project.settings === "object" ? project.settings : {}) as Record<
    string,
    unknown
  >;
  const sourceVideo = settings.sourceVideo as SourceVideo | undefined;

  // 1) 자막 확보: 수동 붙여넣기가 있으면 우선, 없으면 원본 영상에서 자동자막을 받는다.
  let rawTranscript: string | null = null;
  let transcriptSource: HighlightAnalysisResult["transcriptSource"] = "manual";
  if (input.manualTranscript && input.manualTranscript.trim()) {
    rawTranscript = input.manualTranscript;
    transcriptSource = "manual";
  } else if (sourceVideo?.url) {
    rawTranscript = await fetchAutoSubtitles(sourceVideo.url);
    transcriptSource = "auto-subtitle";
  }

  if (!rawTranscript || !rawTranscript.trim()) {
    throw new Error(
      "자막을 확보하지 못했습니다. 원본 영상에 자막이 없으면 자막/타임스탬프를 직접 붙여넣어 다시 시도해주세요.",
    );
  }

  const cues = parseTranscript(rawTranscript);
  if (cues.length === 0) {
    throw new Error("자막을 해석하지 못했습니다. 타임스탬프가 포함된 자막(VTT/SRT 또는 `0:12 텍스트` 형식)인지 확인해주세요.");
  }

  // 2) AI 흥미 구간 선정.
  const format = project.videoFormat === "LONG" ? "LONG" : "SHORT";
  const targetDurationSec = input.targetDurationSec && input.targetDurationSec > 0 ? input.targetDurationSec : DEFAULT_TARGET_SEC[format];
  const segments = await selectEngagingSegments(formatCuesForPrompt(cues), { targetDurationSec, format });

  // 3) 결과를 프로젝트 settings에 저장(Phase 3 컷/자막이 사용). 자막 재타이밍(Phase 3b)을 위해 원본 큐도 보관한다.
  await prisma.project.update({
    where: { id: projectId },
    data: {
      settings: {
        ...settings,
        highlightSegments: segments,
        transcriptCues: cues,
        highlightMeta: { transcriptSource, cueCount: cues.length, targetDurationSec, analyzedAt: new Date().toISOString() },
      } as never,
    },
  });

  return { transcriptSource, cueCount: cues.length, targetDurationSec, segments };
}

export type BuildHighlightTrackResult = { clipCount: number; totalDurationMs: number };

// PROJECT_SPEC.md §2.5 "채널 분석 → 프로젝트 (Phase 3a)": settings.highlightSegments(Phase 2 결과)를 근거로
// 원본 영상을 내려받아 각 구간을 잘라 프로젝트 VIDEO 트랙에 순차 배치한다. 대본/TTS/자막 자동 실행은
// Phase 3b로 분리(이번 라운드는 VIDEO 트랙 구성까지).
export async function buildHighlightVideoTrack(projectId: string): Promise<BuildHighlightTrackResult> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const settings = (project.settings && typeof project.settings === "object" ? project.settings : {}) as Record<
    string,
    unknown
  >;
  const sourceVideo = settings.sourceVideo as SourceVideo | undefined;
  const segments = (settings.highlightSegments as EngagingSegment[] | undefined) ?? [];

  if (!sourceVideo?.url) {
    throw new Error("원본 영상 정보가 없습니다. 채널 분석에서 만든 프로젝트인지 확인해주세요.");
  }
  if (segments.length === 0) {
    throw new Error("선정된 하이라이트 구간이 없습니다. 먼저 '하이라이트 분석'을 실행해주세요.");
  }

  // 타임라인 + VIDEO(autoSync) 트랙 확보.
  const timeline = await getOrSyncTimeline(projectId);
  if (!timeline) throw new Error("타임라인을 불러올 수 없습니다.");
  // 사용자가 자동 트랙을 삭제했을 수 있으므로 ensureAutoTrack으로 없으면 재생성해 확보한다.
  const videoTrack = await ensureAutoTrack(timeline.id, "VIDEO");
  // "비디오 오디오"(AUDIO) 트랙 — 구간별 오디오를 분리 추출해 여기에 클립으로 배치한다(시각적 분리 트랙).
  const audioTrack = await ensureAutoTrack(timeline.id, "AUDIO");

  // 재배치 전 기존 자동 생성분 정리(재실행 시 중복 방지).
  await prisma.timelineClip.deleteMany({ where: { trackId: videoTrack.id } });
  if (audioTrack) await prisma.timelineClip.deleteMany({ where: { trackId: audioTrack.id } });

  const { width, height } = resolveVideoResolution(project.videoFormat);

  await ensureProjectDir(projectId, "source");
  await ensureProjectDir(projectId, "uploads");

  // 구간별로 (원본을 통째로 받지 않고) 해당 구간만 내려받아 리사이즈·배치한다. 긴 생중계(수 시간)를
  // 통째로 받으면 타임아웃/수 GB가 되므로 downloadVideoSection으로 필요한 구간만 받는다.
  let cursorMs = 0;
  let clipCount = 0;
  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];
    const durationMs = seg.endMs - seg.startMs;
    if (durationMs <= 0) continue;

    // 1) 이 구간만 원본에서 내려받는다(raw). 2) 목표 해상도로 리사이즈하며 원본 오디오를 유지해 최종 클립 생성.
    const rawPath = resolveProjectFilePath(projectId, `source/section_${i}.mp4`);
    await downloadVideoSection(sourceVideo.url, seg.startMs / 1000, durationMs / 1000, rawPath);

    const relPath = `uploads/highlight_${Date.now()}_${i}.mp4`;
    await buildVideoSegmentClip(
      rawPath,
      0, // 이미 구간만 받았으므로 offset 0부터.
      durationMs / 1000,
      width,
      height,
      resolveProjectFilePath(projectId, relPath),
      undefined,
      true, // 원본 오디오 유지(사용자 결정): 하이라이트 클립은 원본 소리를 그대로 담는다.
    );

    const media = await prisma.uploadedMedia.create({
      data: { projectId, kind: "video", filePath: relPath, durationMs },
    });
    await prisma.timelineClip.create({
      data: {
        trackId: videoTrack.id,
        startMs: cursorMs,
        endMs: cursorMs + durationMs,
        payload: { label: `하이라이트 ${i + 1}`, mediaId: media.id, mediaKind: "video" },
      },
    });

    // 3) 이 구간의 오디오를 분리 추출해 "비디오 오디오"(AUDIO) 트랙에 같은 위치로 배치한다. 오디오가 없는
    // 영상이면(extractAudioTrack=false) 건너뛴다. 현재는 표시/구조용이며, 실제 소리는 VIDEO 클립이 담당한다.
    if (audioTrack) {
      const audioRel = `uploads/highlight_audio_${Date.now()}_${i}.mp3`;
      const ok = await extractAudioTrack(rawPath, resolveProjectFilePath(projectId, audioRel));
      if (ok) {
        const audioMedia = await prisma.uploadedMedia.create({
          data: { projectId, kind: "audio", filePath: audioRel, durationMs },
        });
        await prisma.timelineClip.create({
          data: {
            trackId: audioTrack.id,
            startMs: cursorMs,
            endMs: cursorMs + durationMs,
            payload: { label: `비디오 오디오 ${i + 1}`, mediaId: audioMedia.id, mediaKind: "audio" },
          },
        });
      }
    }

    cursorMs += durationMs;
    clipCount += 1;
  }

  // 3) 타임라인 총 길이를 하이라이트 합계로 확장(빈 프로젝트는 durationMs=0이라 필수).
  if (cursorMs > timeline.durationMs) {
    await prisma.timeline.update({ where: { id: timeline.id }, data: { durationMs: cursorMs } });
  }
  await prisma.project.update({ where: { id: projectId }, data: { status: "EDITING" } });

  return { clipCount, totalDurationMs: cursorMs };
}

export type HighlightAssetsResult = { subtitleCount: number; scriptTitle: string };

// PROJECT_SPEC.md §2.5 "채널 분석 → 프로젝트 (Phase 3b)": VIDEO 트랙 구성 후 ① 영상 내 오디오 자막
// (원본 자막 큐를 선정 구간 기준으로 재타이밍해 SUBTITLE 트랙에 생성) + ② AI 대본 생성(스크립트 저장).
// 내레이션 TTS(대본 음성)는 오디오 설계 결정이 필요해 이 단계에서 자동 생성하지 않는다.
export async function generateHighlightAssets(projectId: string): Promise<HighlightAssetsResult> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const settings = (project.settings && typeof project.settings === "object" ? project.settings : {}) as Record<
    string,
    unknown
  >;
  const sourceVideo = settings.sourceVideo as SourceVideo | undefined;
  const segments = (settings.highlightSegments as EngagingSegment[] | undefined) ?? [];
  const cues = (settings.transcriptCues as TranscriptCue[] | undefined) ?? [];

  if (segments.length === 0) {
    throw new Error("선정된 하이라이트 구간이 없습니다. 먼저 '하이라이트 분석'을 실행해주세요.");
  }

  // ① 영상 내 오디오 자막: 자막 큐를 새 타임라인으로 재타이밍해 SUBTITLE(autoSync) 트랙에 생성.
  const timeline = await getOrSyncTimeline(projectId);
  if (!timeline) throw new Error("타임라인을 불러올 수 없습니다.");
  const subtitleTrack = await ensureAutoTrack(timeline.id, "SUBTITLE");

  const retimed = retimeCuesToTimeline(cues, segments);
  await prisma.timelineClip.deleteMany({ where: { trackId: subtitleTrack.id } });
  if (retimed.length > 0) {
    await prisma.timelineClip.createMany({
      data: retimed.map((s) => ({
        trackId: subtitleTrack.id,
        startMs: s.startMs,
        endMs: s.endMs,
        payload: { label: s.text.slice(0, 40), text: s.text },
      })),
    });
  }

  // ② AI 대본 생성: 원본 영상 제목 + 자막 발췌를 근거로 새 내레이션 대본을 만들어 프로젝트 스크립트로 저장.
  const excerpt = cues.map((c) => c.text).join(" ").slice(0, 1500);
  const generated = await generateScriptPattern({
    title: sourceVideo?.title ?? project.title,
    description: excerpt || project.description || "",
  });
  await prisma.script.upsert({
    where: { projectId },
    create: {
      projectId,
      topic: sourceVideo?.title ?? project.title,
      title: generated.title,
      hook: generated.hook,
      body: generated.body,
      imagePrompts: generated.imagePrompts,
      model: "claude",
    },
    update: {
      topic: sourceVideo?.title ?? project.title,
      title: generated.title,
      hook: generated.hook,
      body: generated.body,
      imagePrompts: generated.imagePrompts,
      model: "claude",
    },
  });

  return { subtitleCount: retimed.length, scriptTitle: generated.title };
}

export type NarrationAudioMode = "source" | "duck" | "replace";

// 하이라이트 프로젝트의 내레이션 오디오 모드(원본 유지 / 덕킹+내레이션 / 음소거+내레이션)를 읽는다.
// 미설정이면 "source"(원본 유지, 현행 기본).
export async function getNarrationAudioMode(projectId: string): Promise<NarrationAudioMode> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const settings = (project.settings && typeof project.settings === "object" ? project.settings : {}) as Record<
    string,
    unknown
  >;
  const mode = settings.narrationAudioMode;
  return mode === "duck" || mode === "replace" ? mode : "source";
}

// settings.narrationAudioMode를 병합 저장한다("source"면 키를 제거해 기본값으로 되돌린다).
export async function setNarrationAudioMode(projectId: string, mode: NarrationAudioMode) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const next: Record<string, unknown> = { ...(project.settings as Record<string, unknown>) };
  if (mode === "source") delete next.narrationAudioMode;
  else next.narrationAudioMode = mode;
  await prisma.project.update({ where: { id: projectId }, data: { settings: next as Prisma.InputJsonValue } });
  return { mode };
}

export type HighlightThumbnailFrameResult = {
  frameDataUrl: string;
  hook: string;
  width: number;
  height: number;
};

// PROJECT_SPEC.md §2.5 "채널 분석 → 프로젝트 (Phase 4)": 하이라이트 영상 클립에서 대표 프레임 한 장을
// 뽑고 AI 대본의 후킹 문구(Script.hook)를 함께 돌려준다. 텍스트 합성 자체는 한글 폰트 이슈를 피하기
// 위해 브라우저 캔버스(클라이언트)에서 수행하고, 완성 이미지는 기존 썸네일 저장 경로로 업로드된다.
export async function generateHighlightThumbnailFrame(projectId: string): Promise<HighlightThumbnailFrameResult> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  const timeline = await prisma.timeline.findUnique({ where: { projectId } });
  if (!timeline) throw new Error("타임라인이 없습니다. 먼저 '영상 트랙 만들기'를 실행해주세요.");
  const videoTrack = await prisma.timelineTrack.findFirst({ where: { timelineId: timeline.id, type: "VIDEO" } });
  const clip = videoTrack
    ? await prisma.timelineClip.findFirst({ where: { trackId: videoTrack.id }, orderBy: { startMs: "asc" } })
    : null;
  if (!clip) {
    throw new Error("하이라이트 영상 클립이 없습니다. 먼저 '영상 트랙 만들기'를 실행해주세요.");
  }

  const payload = (clip.payload && typeof clip.payload === "object" ? clip.payload : {}) as Record<string, unknown>;
  const mediaId = payload.mediaId as string | undefined;
  if (!mediaId) throw new Error("하이라이트 클립의 미디어 정보를 찾을 수 없습니다.");
  const media = await prisma.uploadedMedia.findUniqueOrThrow({ where: { id: mediaId } });

  // 클립 중간 지점 프레임을 뽑는다 — 도입/전환 프레임을 피해 대표성이 높은 장면을 고른다.
  const midSec = Math.max(0, (clip.endMs - clip.startMs) / 2 / 1000);
  await ensureProjectDir(projectId, "thumbnail");
  const framePath = resolveProjectFilePath(projectId, "thumbnail/highlight_frame.png");
  await extractVideoFrame(resolveProjectFilePath(projectId, media.filePath), midSec, framePath);

  const buffer = await readFile(framePath);
  const frameDataUrl = `data:image/png;base64,${buffer.toString("base64")}`;

  // 후킹 문구는 Phase 3b에서 만든 대본의 hook을 우선 사용하고, 없으면 프로젝트 제목으로 대체한다.
  const script = await prisma.script.findUnique({ where: { projectId } });
  const hook = script?.hook?.trim() || project.title;

  const { width, height } = resolveThumbnailResolution(project.videoFormat);
  return { frameDataUrl, hook, width, height };
}
