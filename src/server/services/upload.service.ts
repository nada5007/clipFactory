import type { PrivacyStatus, Prisma } from "@prisma/client";

import { setThumbnail, uploadVideo } from "@/lib/clients/youtube";
import { prisma } from "@/lib/prisma";
import { readProjectFile } from "@/lib/storage";
import { isValidScheduleTime } from "@/lib/upload-schedule";
import { getValidAccessToken } from "@/server/services/channel-oauth.service";
import { readThumbnailFile } from "@/server/services/thumbnail.service";

const UPLOAD_PROGRESS = 100;

export function getUploadConfig(projectId: string) {
  return prisma.uploadConfig.findUnique({ where: { projectId } });
}

export async function saveUploadConfig(
  projectId: string,
  input: {
    title?: string;
    description?: string;
    tags?: string[];
    privacyStatus?: PrivacyStatus;
    scheduledPublishAt?: Date | null;
  },
) {
  if (input.scheduledPublishAt && !isValidScheduleTime(input.scheduledPublishAt)) {
    throw new Error("예약 시각은 최소 15분 이후여야 합니다.");
  }

  return prisma.uploadConfig.upsert({
    where: { projectId },
    create: {
      projectId,
      title: input.title,
      description: input.description,
      tags: (input.tags ?? []) as Prisma.InputJsonValue,
      privacyStatus: input.privacyStatus,
      scheduledPublishAt: input.scheduledPublishAt,
    },
    update: {
      title: input.title,
      description: input.description,
      ...(input.tags ? { tags: input.tags as Prisma.InputJsonValue } : {}),
      privacyStatus: input.privacyStatus,
      scheduledPublishAt: input.scheduledPublishAt,
    },
  });
}

// 업로드 탭 제목/설명이 비어 있으면 프로젝트 제목/설명으로 대체한다.
// (채널 기본 템플릿 캐스케이드는 채널 설정 업로드 탭을 구현할 때 확장)
export function resolveUploadMetadata(
  project: { title: string; description: string | null },
  config: {
    title: string | null;
    description: string | null;
    tags: unknown;
    privacyStatus: PrivacyStatus;
    scheduledPublishAt?: Date | null;
  } | null,
) {
  const tags = Array.isArray(config?.tags) ? (config.tags as string[]) : [];
  return {
    title: config?.title?.trim() || project.title,
    description: config?.description?.trim() || project.description || "",
    tags,
    privacyStatus: (config?.privacyStatus ?? "PRIVATE").toLowerCase() as "public" | "unlisted" | "private",
    publishAt: config?.scheduledPublishAt ? config.scheduledPublishAt.toISOString() : undefined,
  };
}

export async function uploadToYoutube(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { video: true, script: true, uploadConfig: true, thumbnail: true },
  });

  if (!project.script) {
    throw new Error("스크립트가 없어 업로드할 수 없습니다.");
  }
  if (!project.video) {
    throw new Error("렌더링된 영상이 없어 업로드할 수 없습니다. 먼저 영상을 렌더링해주세요.");
  }

  try {
    const accessToken = await getValidAccessToken(project.channelId);
    const metadata = resolveUploadMetadata(project, project.uploadConfig);
    const videoBuffer = await readProjectFile(projectId, project.video.filePath);

    const { videoId } = await uploadVideo(accessToken, metadata, videoBuffer);

    // 커스텀 썸네일은 채널이 YouTube Studio 중급 기능(전화번호 인증)을 활성화해야 적용된다.
    // 실패해도 업로드 자체는 성공으로 처리하고 경고만 반환한다 (UI_SPEC.md §4.5).
    let thumbnailWarning: string | null = null;
    if (project.thumbnail) {
      try {
        const thumbnailBuffer = await readThumbnailFile(projectId);
        await setThumbnail(accessToken, videoId, thumbnailBuffer);
      } catch (error) {
        thumbnailWarning =
          "썸네일 적용에 실패했습니다. YouTube Studio에서 전화번호 인증(중급 기능) 여부를 확인하세요. " +
          (error instanceof Error ? error.message : "");
      }
    }

    const config = await prisma.uploadConfig.upsert({
      where: { projectId },
      create: {
        projectId,
        title: project.uploadConfig?.title,
        description: project.uploadConfig?.description,
        tags: metadata.tags as Prisma.InputJsonValue,
        privacyStatus: project.uploadConfig?.privacyStatus ?? "PRIVATE",
        scheduledPublishAt: project.uploadConfig?.scheduledPublishAt,
        youtubeVideoId: videoId,
        uploadedAt: new Date(),
      },
      update: { youtubeVideoId: videoId, uploadedAt: new Date() },
    });

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "UPLOADED",
        progress: Math.max(project.progress, UPLOAD_PROGRESS),
        errorMessage: null,
      },
    });

    return { ...config, thumbnailWarning };
  } catch (error) {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "YouTube 업로드 중 오류가 발생했습니다.",
      },
    });
    throw error;
  }
}
