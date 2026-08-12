import { generateAss } from "@/lib/ass";
import {
  buildImageSegmentClip,
  buildVideoSegmentClip,
  burnSubtitles,
  concatAudioFiles,
  concatVideoSegments,
  generateSilence,
  mixAudioTracks,
  mixBgmIntoVideo,
  mixDuckedSourceWithNarration,
  muxVideoAudio,
  prepareBgmAudio,
  trimOrPadAudioToDuration,
} from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { generateSrt } from "@/lib/srt";
import { ensureProjectDir, resolveProjectFilePath, writeProjectFile } from "@/lib/storage";
import {
  computeAudioRenderPlan,
  computeVisualRenderSegments,
  resolveFfmpegColorFilter,
  resolveSubtitleStyle,
  type PersistedClipPayload,
  type PersistedTimelineClip,
  type TimelineTrackType,
} from "@/lib/timeline";
import { resolveVideoResolution } from "@/lib/video";
import { getBgmTrack, getEffectiveBgmSettings, resolveBgmTrackPath } from "@/server/services/bgm.service";
import type { JobProgressReporter } from "@/server/services/job.service";
import { getOrSyncTimeline } from "@/server/services/timeline.service";

const RENDER_PROGRESS = 80;

export function getVideo(projectId: string) {
  return prisma.videoAsset.findUnique({ where: { projectId } });
}

function clipPayload(clip: { payload: unknown }): PersistedClipPayload {
  return (clip.payload as PersistedClipPayload | null) ?? { label: "" };
}

// PROJECT_SPEC.md §1.3 "렌더링 파이프라인 확장": VIDEO/IMAGE 트랙이 여러 개여도 미리보기와 동일한
// 우선순위·겹침(computeVisualRenderSegments)으로 합성하고, BGM을 실제로 믹싱하며, 밝기/대비/채도/
// 덕킹 모드에서 원본 오디오에 적용하는 고정 선형 게인(≈-12dB). 사이드체인 자동 덕킹은 아직 범위 밖.
const DUCK_SOURCE_VOLUME = 0.25;

// 색온도 슬라이더를 ffmpeg 필터로 반영한다. 색보정 프리셋·켄번즈·마스크·전환효과는 아직 범위 밖(disclosure).
export async function renderVideo(projectId: string, onProgress?: JobProgressReporter) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const timeline = await getOrSyncTimeline(projectId);
  if (!timeline) {
    throw new Error("타임라인을 불러올 수 없습니다.");
  }

  const ttsClips = timeline.tracks.find((t) => t.type === "TTS")?.clips ?? [];
  const subtitleClips = timeline.tracks.find((t) => t.type === "SUBTITLE")?.clips ?? [];
  const videoTrackClips = timeline.tracks.find((t) => t.type === "VIDEO")?.clips ?? [];
  const imageTrackClips = timeline.tracks.find((t) => t.type === "IMAGE")?.clips ?? [];

  // 렌더 오디오 전략(하이라이트 프로젝트의 settings.narrationAudioMode에 따라 결정):
  //  - "source": 내레이션 없이 각 비디오 클립의 원본 오디오만 사용(화면이 VIDEO 전용일 때).
  //  - "duck":   원본 오디오를 낮게 깔고 그 위에 TTS 내레이션(+BGM)을 얹는다.
  //  - "replace": 원본을 음소거하고 TTS 내레이션(+BGM)만 사용(일반 프로젝트 기본 경로).
  // 일반 프로젝트는 narrationAudioMode 미설정이라 TTS가 있으면 항상 "replace"로 기존 동작을 유지한다.
  const settings = (project.settings && typeof project.settings === "object" ? project.settings : {}) as Record<
    string,
    unknown
  >;
  const narrationSetting = settings.narrationAudioMode as "source" | "duck" | "replace" | undefined;
  const hasVideoOnlyScreen = videoTrackClips.length > 0 && imageTrackClips.length === 0;

  let audioStrategy: "source" | "duck" | "replace";
  if (ttsClips.length === 0) {
    if (hasVideoOnlyScreen) {
      audioStrategy = "source";
    } else {
      throw new Error(
        "TTS 음성이 없어 영상을 생성할 수 없습니다. 먼저 TTS를 생성하거나, 원본 오디오가 있는 비디오 클립으로 화면을 구성해주세요.",
      );
    }
  } else {
    // duck는 오디오 스트림 불일치(이미지 세그먼트엔 원본 소리가 없음)를 피하기 위해 VIDEO 전용일 때만.
    audioStrategy = narrationSetting === "duck" && hasVideoOnlyScreen ? "duck" : "replace";
  }
  // source/duck는 비디오 세그먼트의 원본 오디오를 유지하고, replace는 음소거한다.
  const keepSourceAudio = audioStrategy === "source" || audioStrategy === "duck";
  // source는 TTS 합성을 건너뛰고, duck/replace는 내레이션을 합성한다.
  const synthesizeNarration = audioStrategy !== "source";

  const { width, height } = resolveVideoResolution(project.videoFormat);
  const totalDurationMs = timeline.durationMs;

  // Prisma가 payload를 JsonValue로 돌려주는데, 실제로는 항상 서비스 계층에서 PersistedClipPayload
  // 형태로 저장한 값이다(clipPayload 헬퍼와 동일한 전제) — computeVisualRenderSegments가 기대하는
  // 형태로 안전하게 취급한다.
  const visualTracks = timeline.tracks as unknown as {
    type: TimelineTrackType;
    order: number;
    visible: boolean;
    clips: PersistedTimelineClip[];
  }[];
  const visualSegments = computeVisualRenderSegments(visualTracks, totalDurationMs);
  if (visualSegments.length === 0) {
    throw new Error("영상에 사용할 이미지나 비디오가 없어 영상을 생성할 수 없습니다. 먼저 이미지를 생성하거나 비디오를 추가해주세요.");
  }

  try {
    await ensureProjectDir(projectId, "tmp");
    await onProgress?.(5, "오디오 준비 중");

    // source 전략에서는 TTS 오디오 합성을 건너뛴다(소리는 비디오 클립에서 나온다).
    let audioFullPath: string | null = null;
    if (synthesizeNarration) {
      const audioSegmentIds = Array.from(new Set(ttsClips.map((c) => clipPayload(c).sourceId).filter((v): v is string => Boolean(v))));
      const audioSegments = await prisma.audioSegment.findMany({ where: { id: { in: audioSegmentIds } } });
      const audioSegmentById = new Map(audioSegments.map((s) => [s.id, s]));

      const audioClipInputs = ttsClips.map((c) => {
        const payload = clipPayload(c);
        const segment = payload.sourceId ? audioSegmentById.get(payload.sourceId) : undefined;
        if (!segment) {
          throw new Error(`TTS 클립이 가리키는 오디오를 찾을 수 없습니다(clipId: ${c.id}). 동기화 후 다시 시도해주세요.`);
        }
        return {
          startMs: c.startMs,
          endMs: c.endMs,
          filePath: resolveProjectFilePath(projectId, segment.filePath),
          sourceOffsetMs: payload.sourceOffsetMs ?? 0,
          naturalDurationMs: segment.endMs - segment.startMs,
        };
      });

      const audioPlan = computeAudioRenderPlan(audioClipInputs, totalDurationMs);
      const audioPartPaths: string[] = [];
      for (let i = 0; i < audioPlan.length; i++) {
        const part = audioPlan[i];
        if (part.durationSec <= 0) continue;
        if (part.type === "silence") {
          const silencePath = resolveProjectFilePath(projectId, `tmp/silence_${i}.mp3`);
          await generateSilence(part.durationSec, silencePath);
          audioPartPaths.push(silencePath);
        } else if (part.needsTrim) {
          const trimmedPath = resolveProjectFilePath(projectId, `tmp/tts_trim_${i}.mp3`);
          await trimOrPadAudioToDuration(part.filePath, part.offsetSec, part.durationSec, trimmedPath);
          audioPartPaths.push(trimmedPath);
        } else {
          audioPartPaths.push(part.filePath);
        }
      }

      audioFullPath = resolveProjectFilePath(projectId, "audio_full.mp3");
      await concatAudioFiles(audioPartPaths, resolveProjectFilePath(projectId, "tmp/audio_concat.txt"), audioFullPath);
    }
    await onProgress?.(20, "영상/이미지 자료 준비 중");

    // visualSegments가 참조하는 클립만 골라 자산을 조회한다(실제로 화면에 쓰이지 않는, 우선순위에서
    // 밀린 클립의 자산까지 전부 조회/검증할 필요는 없다).
    const imageSourceIds = new Set<string>();
    const uploadedMediaIds = new Set<string>();
    for (const seg of visualSegments) {
      const payload = clipPayload(seg.clip);
      if (payload.mediaId) uploadedMediaIds.add(payload.mediaId);
      else if (seg.trackType === "IMAGE" && payload.sourceId) imageSourceIds.add(payload.sourceId);
    }
    const imageAssets = await prisma.imageAsset.findMany({ where: { id: { in: Array.from(imageSourceIds) } } });
    const imageAssetById = new Map(imageAssets.map((a) => [a.id, a]));
    const uploadedMedia = await prisma.uploadedMedia.findMany({ where: { id: { in: Array.from(uploadedMediaIds) } } });
    const uploadedMediaById = new Map(uploadedMedia.map((m) => [m.id, m]));

    const visualPartPaths: string[] = [];
    for (let i = 0; i < visualSegments.length; i++) {
      const seg = visualSegments[i];
      const payload = clipPayload(seg.clip);
      const durationSec = (seg.segmentEndMs - seg.segmentStartMs) / 1000;
      if (durationSec <= 0) continue;

      const colorFilter = resolveFfmpegColorFilter(payload.effects) || undefined;
      const outPath = resolveProjectFilePath(projectId, `tmp/visual_${i}.mp4`);

      if (seg.trackType === "VIDEO") {
        const media = payload.mediaId ? uploadedMediaById.get(payload.mediaId) : undefined;
        if (!media) {
          throw new Error(`비디오 클립이 가리키는 파일을 찾을 수 없습니다(clipId: ${seg.clip.id}). 동기화 후 다시 시도해주세요.`);
        }
        const offsetSec = Math.max(0, ((payload.sourceOffsetMs ?? 0) + (seg.segmentStartMs - seg.clip.startMs)) / 1000);
        await buildVideoSegmentClip(
          resolveProjectFilePath(projectId, media.filePath),
          offsetSec,
          durationSec,
          width,
          height,
          outPath,
          colorFilter,
          keepSourceAudio, // source/duck 전략이면 클립 원본 오디오를 유지해 이어붙인다.
        );
      } else {
        const imagePath = payload.mediaId
          ? uploadedMediaById.get(payload.mediaId)?.filePath
          : payload.sourceId
            ? imageAssetById.get(payload.sourceId)?.filePath
            : undefined;
        if (!imagePath) {
          throw new Error(`이미지 클립이 가리키는 이미지를 찾을 수 없습니다(clipId: ${seg.clip.id}). 동기화 후 다시 시도해주세요.`);
        }
        await buildImageSegmentClip(resolveProjectFilePath(projectId, imagePath), durationSec, width, height, outPath, colorFilter);
      }
      visualPartPaths.push(outPath);
    }

    const videoOnlyPath = resolveProjectFilePath(projectId, "video_only.mp4");
    await concatVideoSegments(visualPartPaths, resolveProjectFilePath(projectId, "tmp/visual_concat.txt"), videoOnlyPath);
    await onProgress?.(45, "BGM 믹싱 중");

    // 프로젝트 유효 BGM 설정(프로젝트 우선, 없으면 채널 기본값)을 미리 가공해 둔다 — 미리보기
    // 재생(playBgmFrom)이 참조하는 것과 동일한 프로젝트 단위 설정을 그대로 쓴다.
    let bgmPreparedPath: string | null = null;
    const effectiveBgm = await getEffectiveBgmSettings(projectId);
    if (effectiveBgm.settings?.trackId) {
      const bgmTrack = await getBgmTrack(effectiveBgm.settings.trackId);
      if (bgmTrack) {
        bgmPreparedPath = resolveProjectFilePath(projectId, "tmp/bgm_prepared.mp3");
        const volumeLinear = Math.max(0, 10 ** (effectiveBgm.settings.volumeDb / 20));
        await prepareBgmAudio(
          resolveBgmTrackPath(bgmTrack),
          { volumeLinear, playbackSpeed: effectiveBgm.settings.playbackSpeed, loop: effectiveBgm.settings.loop },
          totalDurationMs / 1000,
          bgmPreparedPath,
        );
      }
    }

    // 자막을 입힐 대상 영상.
    let videoForSubtitles = videoOnlyPath;
    if (audioStrategy === "source") {
      // 원본 오디오만: 이어붙인 영상이 이미 원본 소리를 갖고 있다. BGM이 설정돼 있으면 원본
      // 오디오를 덮지 않고 그 위에 덧믹싱한다(내레이션 없음, 원본 소리 + BGM).
      if (bgmPreparedPath) {
        await onProgress?.(70, "원본 오디오 위 BGM 덧믹싱 중");
        const videoWithBgmPath = resolveProjectFilePath(projectId, "video_bgm.mp4");
        await mixBgmIntoVideo(videoOnlyPath, bgmPreparedPath, videoWithBgmPath);
        videoForSubtitles = videoWithBgmPath;
      }
    } else {
      // duck/replace: TTS 내레이션에 BGM을 섞어 최종 내레이션 오디오를 만든다.
      let finalAudioPath = audioFullPath!;
      if (bgmPreparedPath) {
        const mixedPath = resolveProjectFilePath(projectId, "audio_mixed.mp3");
        await mixAudioTracks(audioFullPath!, bgmPreparedPath, mixedPath);
        finalAudioPath = mixedPath;
      }

      if (audioStrategy === "duck") {
        // 덕킹: videoOnlyPath에 유지된 원본 소리를 낮게 깔고 그 위에 내레이션(+BGM)을 얹는다.
        await onProgress?.(70, "원본 오디오 덕킹 + 내레이션 믹싱 중");
        const duckedPath = resolveProjectFilePath(projectId, "video_ducked.mp4");
        await mixDuckedSourceWithNarration(videoOnlyPath, finalAudioPath, DUCK_SOURCE_VOLUME, duckedPath);
        videoForSubtitles = duckedPath;
      } else {
        // replace: videoOnlyPath는 음소거 상태 — 내레이션(+BGM)을 그대로 입힌다.
        await onProgress?.(70, "영상과 음성 합성 중");
        const mutedVideoPath = resolveProjectFilePath(projectId, "video_muted.mp4");
        await muxVideoAudio(videoOnlyPath, finalAudioPath, mutedVideoPath);
        videoForSubtitles = mutedVideoPath;
      }
    }
    await onProgress?.(90, "자막 삽입 중");

    const srtRelativePath = "subtitles.srt";
    const srt = generateSrt(subtitleClips.map((c) => ({ text: clipPayload(c).text ?? "", startMs: c.startMs, endMs: c.endMs })));
    await writeProjectFile(projectId, srtRelativePath, Buffer.from(srt, "utf-8"));

    const assCues = subtitleClips
      .filter((c) => (clipPayload(c).text ?? "").trim().length > 0)
      .map((c) => ({
        text: clipPayload(c).text ?? "",
        startMs: c.startMs,
        endMs: c.endMs,
        style: resolveSubtitleStyle(clipPayload(c).style, width, height),
      }));
    const assRelativePath = "tmp/subtitles.ass";
    await writeProjectFile(projectId, assRelativePath, Buffer.from(generateAss(assCues, width, height), "utf-8"));

    const videoRelativePath = "video.mp4";
    await burnSubtitles(
      videoForSubtitles,
      resolveProjectFilePath(projectId, assRelativePath),
      resolveProjectFilePath(projectId, videoRelativePath),
    );

    const video = await prisma.videoAsset.upsert({
      where: { projectId },
      create: {
        projectId,
        filePath: videoRelativePath,
        subtitlePath: srtRelativePath,
        durationMs: totalDurationMs,
        width,
        height,
      },
      update: {
        filePath: videoRelativePath,
        subtitlePath: srtRelativePath,
        durationMs: totalDurationMs,
        width,
        height,
      },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "RENDERED",
        progress: Math.max(project.progress, RENDER_PROGRESS),
        errorMessage: null,
      },
    });

    return video;
  } catch (error) {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "영상 렌더링 중 오류가 발생했습니다.",
      },
    });
    throw error;
  }
}
