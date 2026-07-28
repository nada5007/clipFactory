import type { VideoFormat } from "@prisma/client";

import { buildImagePrompt, editImage, generateImage, resolveImageSize } from "@/lib/clients/image";
import { editImageWithNanoBanana, generateImageWithNanoBanana } from "@/lib/clients/nano-banana";
import {
  DEFAULT_IMAGE_MODEL_KEY,
  getImageModelOption,
  type ImageModelOption,
  type ImageTransformRatio,
  type ImageTransformResolution,
} from "@/lib/image-models";
import { prisma } from "@/lib/prisma";
import { deleteProjectFile, readProjectFile, writeProjectFile } from "@/lib/storage";
import type { JobProgressReporter } from "@/server/services/job.service";

const IMAGE_PROGRESS = 40;

export function listImages(projectId: string) {
  return prisma.imageAsset.findMany({ where: { projectId }, orderBy: { order: "asc" } });
}

export function getImage(projectId: string, imageId: string) {
  return prisma.imageAsset.findFirst({ where: { id: imageId, projectId } });
}

function resolveAspectRatio(videoFormat: VideoFormat): ImageTransformRatio {
  return videoFormat === "LONG" ? "16:9" : "9:16";
}

function describeSize(
  model: ImageModelOption,
  videoFormat: VideoFormat,
  resolution?: ImageTransformResolution,
): string {
  if (model.provider === "openai") {
    return resolveImageSize(videoFormat);
  }
  return `${resolveAspectRatio(videoFormat)}@${resolution ?? "2K"}`;
}

async function generateWithModel(input: {
  model: ImageModelOption;
  prompt: string;
  videoFormat: VideoFormat;
  resolution?: ImageTransformResolution;
}): Promise<Buffer> {
  if (input.model.provider === "openai") {
    return generateImage(input.prompt, resolveImageSize(input.videoFormat), input.model.quality);
  }
  return generateImageWithNanoBanana(input.model.id, input.prompt, {
    aspectRatio: resolveAspectRatio(input.videoFormat),
    imageSize: input.resolution ?? "2K",
  });
}

async function editWithModel(input: {
  model: ImageModelOption;
  images: Buffer[];
  prompt: string;
  videoFormat: VideoFormat;
  resolution?: ImageTransformResolution;
  ratio?: ImageTransformRatio;
}): Promise<Buffer> {
  if (input.model.provider === "openai") {
    return editImage(input.images, input.prompt, resolveImageSize(input.videoFormat), input.model.quality);
  }
  return editImageWithNanoBanana(input.model.id, input.images, input.prompt, {
    aspectRatio: input.ratio ?? resolveAspectRatio(input.videoFormat),
    imageSize: input.resolution ?? "2K",
  });
}

// PROJECT_SPEC.md §1.3 "전체 재생성 모달 고도화": 모델 선택 + 장면별 프롬프트 임시 조정을 지원한다.
// promptOverrides는 이번 실행에만 적용되고 Script.imagePrompts는 변경하지 않는다.
export async function generateImages(
  projectId: string,
  input?: { modelKey?: string; promptOverrides?: Record<number, string>; resolution?: ImageTransformResolution },
  onProgress?: JobProgressReporter,
) {
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

  const model = getImageModelOption(input?.modelKey ?? DEFAULT_IMAGE_MODEL_KEY);
  const channelSettings = project.channel.defaultSettings as { imagePrompt?: string } | null;

  try {
    await prisma.imageAsset.deleteMany({ where: { projectId } });

    const images = [];
    for (let order = 0; order < prompts.length; order++) {
      const scenePrompt = input?.promptOverrides?.[order] ?? prompts[order];
      const prompt = buildImagePrompt(scenePrompt, channelSettings?.imagePrompt);
      const buffer = await generateWithModel({
        model,
        prompt,
        videoFormat: project.videoFormat,
        resolution: input?.resolution,
      });
      const relativePath = `images/${order}.png`;
      await writeProjectFile(projectId, relativePath, buffer);

      const image = await prisma.imageAsset.create({
        data: {
          projectId,
          order,
          prompt: scenePrompt,
          filePath: relativePath,
          model: model.id,
          quality: model.quality ?? null,
          size: describeSize(model, project.videoFormat, input?.resolution),
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

// 카드별 액션 1/5 "이미지 재생성": 해당 장면 하나만 즉시 재생성해 덮어쓴다.
export async function regenerateSingleImage(
  projectId: string,
  imageId: string,
  input: { prompt?: string; modelKey: string; resolution?: ImageTransformResolution },
) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { channel: true },
  });
  const existing = await prisma.imageAsset.findFirstOrThrow({ where: { id: imageId, projectId } });
  const model = getImageModelOption(input.modelKey);
  const channelSettings = project.channel.defaultSettings as { imagePrompt?: string } | null;

  const scenePrompt = input.prompt ?? existing.prompt;
  const prompt = buildImagePrompt(scenePrompt, channelSettings?.imagePrompt);
  const buffer = await generateWithModel({
    model,
    prompt,
    videoFormat: project.videoFormat,
    resolution: input.resolution,
  });

  const relativePath = existing.filePath ?? `images/${existing.order}.png`;
  await writeProjectFile(projectId, relativePath, buffer);

  return prisma.imageAsset.update({
    where: { id: imageId },
    data: {
      prompt: scenePrompt,
      filePath: relativePath,
      model: model.id,
      quality: model.quality ?? null,
      size: describeSize(model, project.videoFormat, input.resolution),
    },
  });
}

// 카드별 액션 2/5 "삭제"
export async function deleteImage(projectId: string, imageId: string) {
  const existing = await prisma.imageAsset.findFirst({ where: { id: imageId, projectId } });
  if (!existing) {
    throw new Error("이미지를 찾을 수 없습니다.");
  }
  if (existing.filePath) {
    await deleteProjectFile(projectId, existing.filePath);
  }
  await prisma.imageAsset.delete({ where: { id: imageId } });
}

// "빈 카드 추가": 아직 이미지가 없는 슬롯만 만든다. 이후 업로드 또는 재생성으로 채운다.
export async function addBlankImage(projectId: string) {
  const aggregate = await prisma.imageAsset.aggregate({ where: { projectId }, _max: { order: true } });
  const order = (aggregate._max.order ?? -1) + 1;

  return prisma.imageAsset.create({
    data: { projectId, order, prompt: "", filePath: null, model: "", quality: null, size: "" },
  });
}

// 카드별 액션 3/5 "이미지 교체"(업로드)
export async function replaceImageFile(projectId: string, imageId: string, buffer: Buffer) {
  const existing = await prisma.imageAsset.findFirstOrThrow({ where: { id: imageId, projectId } });
  const relativePath = existing.filePath ?? `images/${existing.order}.png`;
  await writeProjectFile(projectId, relativePath, buffer);

  return prisma.imageAsset.update({
    where: { id: imageId },
    data: { filePath: relativePath, model: "upload", quality: null },
  });
}

function applyStrengthModifier(prompt: string, strength: number): string {
  const instruction =
    strength <= 30
      ? "원본 이미지의 구도와 디테일을 최대한 유지하며 미세하게만 수정한다."
      : strength >= 70
        ? "원본에 얽매이지 않고 자유롭게 재해석한다."
        : "원본의 주요 특징은 유지하되 자연스럽게 새로 반영한다.";
  return `${prompt}\n\n${instruction}`;
}

export type ImageTransformInput = {
  // 프로젝트에 이미 존재하는 이미지(대상 카드 등)를 소스로 포함할 때
  existingImageIds?: string[];
  // 사용자가 로컬 드라이브에서 새로 업로드한 이미지 바이트
  uploadedImages?: Buffer[];
  prompt: string;
  modelKey: string;
  ratio: ImageTransformRatio;
  resolution: ImageTransformResolution;
  strength: number;
};

// 카드별 액션 4/5 "이미지 변환" — 미리보기 (base64 반환, 아직 저장하지 않음).
// 소스 이미지는 기존 이미지(existingImageIds)와 로컬 업로드(uploadedImages)를 섞어 최대 5개까지 받는다.
export async function previewImageTransform(projectId: string, input: ImageTransformInput): Promise<string> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  const buffers: Buffer[] = [];
  if (input.existingImageIds && input.existingImageIds.length > 0) {
    const sources = await prisma.imageAsset.findMany({
      where: { projectId, id: { in: input.existingImageIds } },
    });
    for (const source of sources) {
      if (source.filePath) {
        buffers.push(await readProjectFile(projectId, source.filePath));
      }
    }
  }
  if (input.uploadedImages) {
    buffers.push(...input.uploadedImages);
  }
  if (buffers.length === 0) {
    throw new Error("변환할 소스 이미지가 없습니다.");
  }

  const model = getImageModelOption(input.modelKey);
  const prompt = applyStrengthModifier(input.prompt, input.strength);
  const buffer = await editWithModel({
    model,
    images: buffers,
    prompt,
    videoFormat: project.videoFormat,
    resolution: input.resolution,
    ratio: input.ratio,
  });

  return buffer.toString("base64");
}

// 미리보기 결과를 실제로 대상 카드에 반영한다 (재계산 없이 이미 받은 base64를 그대로 저장).
export async function applyImageTransform(projectId: string, imageId: string, imageBase64: string) {
  const existing = await prisma.imageAsset.findFirstOrThrow({ where: { id: imageId, projectId } });
  const relativePath = existing.filePath ?? `images/${existing.order}.png`;
  await writeProjectFile(projectId, relativePath, Buffer.from(imageBase64, "base64"));

  return prisma.imageAsset.update({
    where: { id: imageId },
    data: { filePath: relativePath, model: "transform" },
  });
}
