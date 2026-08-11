import { selectEngagingSegments, type EngagingSegment } from "@/lib/clients/anthropic";
import { buildVideoSegmentClip } from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { ensureProjectDir, resolveProjectFilePath } from "@/lib/storage";
import { formatCuesForPrompt, parseTranscript } from "@/lib/transcript";
import { resolveVideoResolution } from "@/lib/video";
import { downloadVideo, fetchAutoSubtitles } from "@/lib/ytdlp";
import { getOrSyncTimeline } from "@/server/services/timeline.service";

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

  // 3) 결과를 프로젝트 settings에 저장(Phase 3 컷이 사용).
  await prisma.project.update({
    where: { id: projectId },
    data: {
      settings: {
        ...settings,
        highlightSegments: segments,
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
  const videoTrack = await prisma.timelineTrack.findFirst({
    where: { timelineId: timeline.id, type: "VIDEO", autoSync: true },
  });
  if (!videoTrack) throw new Error("VIDEO 트랙을 찾을 수 없습니다.");

  // 재배치 전 기존 자동 생성분 정리(재실행 시 중복 방지).
  await prisma.timelineClip.deleteMany({ where: { trackId: videoTrack.id } });

  const { width, height } = resolveVideoResolution(project.videoFormat);

  // 1) 원본 영상 다운로드.
  await ensureProjectDir(projectId, "source");
  await ensureProjectDir(projectId, "uploads");
  const sourcePath = resolveProjectFilePath(projectId, "source/original.mp4");
  await downloadVideo(sourceVideo.url, sourcePath);

  // 2) 구간별로 잘라 파일·UploadedMedia·클립을 만들고 트랙에 순차 배치.
  let cursorMs = 0;
  let clipCount = 0;
  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i < sorted.length; i++) {
    const seg = sorted[i];
    const durationMs = seg.endMs - seg.startMs;
    if (durationMs <= 0) continue;

    const relPath = `uploads/highlight_${Date.now()}_${i}.mp4`;
    await buildVideoSegmentClip(
      sourcePath,
      seg.startMs / 1000,
      durationMs / 1000,
      width,
      height,
      resolveProjectFilePath(projectId, relPath),
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
