import { buildImageSlideshow, concatAudioFiles, muxVideoAudio } from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { generateSrt } from "@/lib/srt";
import { ensureProjectDir, resolveProjectFilePath, writeProjectFile } from "@/lib/storage";
import { computePerImageDurationSec, resolveVideoResolution } from "@/lib/video";
import type { JobProgressReporter } from "@/server/services/job.service";

const RENDER_PROGRESS = 80;

export function getVideo(projectId: string) {
  return prisma.videoAsset.findUnique({ where: { projectId } });
}

export async function renderVideo(projectId: string, onProgress?: JobProgressReporter) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      audioSegments: { orderBy: { order: "asc" } },
      images: { orderBy: { order: "asc" } },
    },
  });

  if (project.audioSegments.length === 0) {
    throw new Error("TTS 음성이 없어 영상을 생성할 수 없습니다. 먼저 TTS를 생성해주세요.");
  }
  if (project.images.length === 0) {
    throw new Error("이미지가 없어 영상을 생성할 수 없습니다. 먼저 이미지를 생성해주세요.");
  }

  const { width, height } = resolveVideoResolution(project.videoFormat);
  const totalDurationMs = project.audioSegments[project.audioSegments.length - 1].endMs;

  try {
    await ensureProjectDir(projectId, "tmp");
    await onProgress?.(5, "오디오 합치는 중");

    const audioPaths = project.audioSegments.map((segment) =>
      resolveProjectFilePath(projectId, segment.filePath),
    );
    const audioFullPath = resolveProjectFilePath(projectId, "audio_full.mp3");
    await concatAudioFiles(
      audioPaths,
      resolveProjectFilePath(projectId, "tmp/audio_concat.txt"),
      audioFullPath,
    );
    await onProgress?.(30, "이미지 슬라이드쇼 생성 중");

    const imagePaths = project.images.map((image) => resolveProjectFilePath(projectId, image.filePath));
    const perImageDurationSec = computePerImageDurationSec(totalDurationMs, project.images.length);
    const videoOnlyPath = resolveProjectFilePath(projectId, "video_only.mp4");
    await buildImageSlideshow(
      imagePaths,
      perImageDurationSec,
      width,
      height,
      resolveProjectFilePath(projectId, "tmp/images_concat.txt"),
      videoOnlyPath,
    );
    await onProgress?.(70, "영상과 음성 합성 중");

    const videoRelativePath = "video.mp4";
    await muxVideoAudio(
      videoOnlyPath,
      audioFullPath,
      resolveProjectFilePath(projectId, videoRelativePath),
    );
    await onProgress?.(90, "자막 파일 생성 중");

    const srtRelativePath = "subtitles.srt";
    const srt = generateSrt(project.audioSegments);
    await writeProjectFile(projectId, srtRelativePath, Buffer.from(srt, "utf-8"));

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
