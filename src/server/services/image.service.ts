import { IMAGE_MODEL, buildImagePrompt, generateImage, resolveImageSize } from "@/lib/clients/image";
import { prisma } from "@/lib/prisma";
import { writeProjectFile } from "@/lib/storage";
import type { JobProgressReporter } from "@/server/services/job.service";

const IMAGE_PROGRESS = 40;

export function listImages(projectId: string) {
  return prisma.imageAsset.findMany({ where: { projectId }, orderBy: { order: "asc" } });
}

export function getImage(projectId: string, imageId: string) {
  return prisma.imageAsset.findFirst({ where: { id: imageId, projectId } });
}

export async function generateImages(projectId: string, onProgress?: JobProgressReporter) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { channel: true, script: true },
  });

  if (!project.script) {
    throw new Error("스크립트가 없어 이미지를 생성할 수 없습니다. 먼저 스크립트를 생성해주세요.");
  }

  const prompts = project.script.imagePrompts as string[];
  if (prompts.length === 0) {
    throw new Error("이미지 프롬프트가 없습니다.");
  }

  const size = resolveImageSize(project.videoFormat);
  const channelSettings = project.channel.defaultSettings as { imagePrompt?: string } | null;

  try {
    await prisma.imageAsset.deleteMany({ where: { projectId } });

    const images = [];
    for (let order = 0; order < prompts.length; order++) {
      const prompt = buildImagePrompt(prompts[order], channelSettings?.imagePrompt);
      const buffer = await generateImage(prompt, size);
      const relativePath = `images/${order}.png`;
      await writeProjectFile(projectId, relativePath, buffer);

      const image = await prisma.imageAsset.create({
        data: {
          projectId,
          order,
          prompt: prompts[order],
          filePath: relativePath,
          model: IMAGE_MODEL,
          size,
        },
      });
      images.push(image);
      await onProgress?.(
        Math.round(((order + 1) / prompts.length) * 100),
        `이미지 ${order + 1}/${prompts.length} 생성 완료`,
      );
    }

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "IMAGING",
        progress: Math.max(project.progress, IMAGE_PROGRESS),
        errorMessage: null,
      },
    });

    return images;
  } catch (error) {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "이미지 생성 중 오류가 발생했습니다.",
      },
    });
    throw error;
  }
}
