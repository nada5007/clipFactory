import { generateAss } from "@/lib/ass";
import {
  buildImageSlideshow,
  burnSubtitles,
  concatAudioFiles,
  generateSilence,
  muxVideoAudio,
  trimOrPadAudioToDuration,
} from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { generateSrt } from "@/lib/srt";
import { ensureProjectDir, resolveProjectFilePath, writeProjectFile } from "@/lib/storage";
import {
  computeAudioRenderPlan,
  computeImageRenderSegments,
  resolveSubtitleStyle,
  type PersistedClipPayload,
} from "@/lib/timeline";
import { resolveVideoResolution } from "@/lib/video";
import type { JobProgressReporter } from "@/server/services/job.service";
import { getOrSyncTimeline } from "@/server/services/timeline.service";

const RENDER_PROGRESS = 80;

export function getVideo(projectId: string) {
  return prisma.videoAsset.findUnique({ where: { projectId } });
}

function clipPayload(clip: { payload: unknown }): PersistedClipPayload {
  return (clip.payload as PersistedClipPayload | null) ?? { label: "" };
}

// PROJECT_SPEC.md §1.3 "타임라인 편집기 — 렌더링 파이프라인을 Timeline 기준으로 재구축": 기존에는
// project.audioSegments/images 원본 테이블만 읽어 렌더링해서, 타임라인 편집기에서의 드래그/트림/분할/
// 텍스트·스타일 수정이 최종 영상에 전혀 반영되지 않았다. 이제 TimelineClip(TTS/IMAGE/SUBTITLE)을
// 기준으로 렌더링해 편집 결과가 그대로 반영되도록 한다. 트림/삭제로 생긴 빈 구간은 무음(오디오)/
// 이전 이미지 연장(이미지)으로 채운다(computeAudioRenderPlan/computeImageRenderSegments).
export async function renderVideo(projectId: string, onProgress?: JobProgressReporter) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const timeline = await getOrSyncTimeline(projectId);
  if (!timeline) {
    throw new Error("타임라인을 불러올 수 없습니다.");
  }

  const ttsClips = timeline.tracks.find((t) => t.type === "TTS")?.clips ?? [];
  const imageClips = timeline.tracks.find((t) => t.type === "IMAGE")?.clips ?? [];
  const subtitleClips = timeline.tracks.find((t) => t.type === "SUBTITLE")?.clips ?? [];

  if (ttsClips.length === 0) {
    throw new Error("TTS 음성이 없어 영상을 생성할 수 없습니다. 먼저 TTS를 생성해주세요.");
  }
  if (imageClips.length === 0) {
    throw new Error("이미지가 없어 영상을 생성할 수 없습니다. 먼저 이미지를 생성해주세요.");
  }

  const { width, height } = resolveVideoResolution(project.videoFormat);
  const totalDurationMs = timeline.durationMs;

  try {
    await ensureProjectDir(projectId, "tmp");
    await onProgress?.(5, "오디오 준비 중");

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

    const audioFullPath = resolveProjectFilePath(projectId, "audio_full.mp3");
    await concatAudioFiles(audioPartPaths, resolveProjectFilePath(projectId, "tmp/audio_concat.txt"), audioFullPath);
    await onProgress?.(30, "이미지 슬라이드쇼 생성 중");

    const imageAssetIds = Array.from(new Set(imageClips.map((c) => clipPayload(c).sourceId).filter((v): v is string => Boolean(v))));
    const imageAssets = await prisma.imageAsset.findMany({ where: { id: { in: imageAssetIds } } });
    const imageAssetById = new Map(imageAssets.map((i) => [i.id, i]));

    const blankImages = imageAssets.filter((i) => !i.filePath);
    if (blankImages.length > 0) {
      throw new Error(
        `아직 채워지지 않은 빈 이미지 카드가 ${blankImages.length}개 있습니다. 업로드 또는 재생성으로 먼저 채워주세요.`,
      );
    }

    const imageClipInputs = imageClips.map((c) => {
      const payload = clipPayload(c);
      const asset = payload.sourceId ? imageAssetById.get(payload.sourceId) : undefined;
      if (!asset?.filePath) {
        throw new Error(`이미지 클립이 가리키는 이미지를 찾을 수 없습니다(clipId: ${c.id}). 동기화 후 다시 시도해주세요.`);
      }
      return { startMs: c.startMs, endMs: c.endMs, imagePath: resolveProjectFilePath(projectId, asset.filePath) };
    });

    const imageSegments = computeImageRenderSegments(imageClipInputs, totalDurationMs);
    const videoOnlyPath = resolveProjectFilePath(projectId, "video_only.mp4");
    await buildImageSlideshow(
      imageSegments.map((s) => s.imagePath),
      imageSegments.map((s) => s.durationSec),
      width,
      height,
      resolveProjectFilePath(projectId, "tmp/images_concat.txt"),
      videoOnlyPath,
    );
    await onProgress?.(70, "영상과 음성 합성 중");

    const mutedVideoPath = resolveProjectFilePath(projectId, "video_muted.mp4");
    await muxVideoAudio(videoOnlyPath, audioFullPath, mutedVideoPath);
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
      mutedVideoPath,
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
