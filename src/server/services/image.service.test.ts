import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { editImage, generateImage } from "@/lib/clients/image";
import { prisma } from "@/lib/prisma";
import {
  addBlankImage,
  applyImageTransform,
  deleteImage,
  generateImages,
  previewImageTransform,
  regenerateSingleImage,
  replaceImageFile,
} from "@/server/services/image.service";

vi.mock("@/lib/clients/image", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clients/image")>("@/lib/clients/image");
  return { ...actual, generateImage: vi.fn(), editImage: vi.fn() };
});

async function createTestProjectWithScript(imagePrompts: string[]) {
  const channel = await prisma.channel.create({ data: { name: "테스트 채널", defaultSettings: {} } });
  const project = await prisma.project.create({
    data: { title: "테스트 프로젝트", channelId: channel.id, videoFormat: "SHORT", settings: {} },
  });
  await prisma.script.create({
    data: {
      projectId: project.id,
      topic: "주제",
      title: "제목",
      hook: "훅",
      body: "본문",
      imagePrompts,
      model: "claude-opus-4-8",
    },
  });
  return { channel, project };
}

async function cleanup(projectId: string, channelId: string) {
  await prisma.imageAsset.deleteMany({ where: { projectId } });
  await prisma.script.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.channel.delete({ where: { id: channelId } });
  await fs.rm(path.join(process.cwd(), "storage", projectId), { recursive: true, force: true });
}

describe("generateImages", () => {
  afterEach(() => {
    vi.mocked(generateImage).mockReset();
  });

  it("이미지 프롬프트마다 이미지를 생성하고 Project.status/progress를 갱신한다", async () => {
    const { channel, project } = await createTestProjectWithScript(["a cat", "a dog"]);
    try {
      vi.mocked(generateImage).mockResolvedValue(Buffer.from("fake-png"));

      const images = await generateImages(project.id);

      expect(images).toHaveLength(2);
      expect(images[0]).toMatchObject({ order: 0, prompt: "a cat", size: "1024x1536" });
      expect(images[1]).toMatchObject({ order: 1, prompt: "a dog" });
      expect(generateImage).toHaveBeenCalledTimes(2);

      const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(updated.status).toBe("IMAGING");
      expect(updated.progress).toBe(40);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("이미지 생성마다 onProgress 콜백을 호출한다", async () => {
    const { channel, project } = await createTestProjectWithScript(["a cat", "a dog"]);
    try {
      vi.mocked(generateImage).mockResolvedValue(Buffer.from("fake-png"));
      const onProgress = vi.fn();

      await generateImages(project.id, undefined, onProgress);

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenNthCalledWith(1, 50, expect.stringContaining("1/2"));
      expect(onProgress).toHaveBeenNthCalledWith(2, 100, expect.stringContaining("2/2"));
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("스크립트가 없으면 에러를 던진다", async () => {
    const channel = await prisma.channel.create({ data: { name: "테스트 채널2", defaultSettings: {} } });
    const project = await prisma.project.create({
      data: { title: "스크립트 없는 프로젝트", channelId: channel.id, videoFormat: "SHORT", settings: {} },
    });
    try {
      await expect(generateImages(project.id)).rejects.toThrow("스크립트가 없어");
    } finally {
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.channel.delete({ where: { id: channel.id } });
    }
  });

  it("생성 실패 시 Project.status를 FAILED로 바꾼다", async () => {
    const { channel, project } = await createTestProjectWithScript(["a cat"]);
    try {
      vi.mocked(generateImage).mockRejectedValue(new Error("이미지 API 오류"));

      await expect(generateImages(project.id)).rejects.toThrow("이미지 API 오류");

      const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(updated.status).toBe("FAILED");
      expect(updated.errorMessage).toBe("이미지 API 오류");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});

describe("regenerateSingleImage", () => {
  afterEach(() => {
    vi.mocked(generateImage).mockReset();
  });

  it("해당 장면 하나만 재생성하고 다른 이미지는 그대로 둔다", async () => {
    const { channel, project } = await createTestProjectWithScript(["a cat", "a dog"]);
    try {
      vi.mocked(generateImage).mockResolvedValue(Buffer.from("fake-png"));
      const images = await generateImages(project.id);

      vi.mocked(generateImage).mockResolvedValue(Buffer.from("regenerated-png"));
      const updated = await regenerateSingleImage(project.id, images[0].id, {
        modelKey: "openai-low",
        prompt: "a fluffy cat",
      });

      expect(updated.prompt).toBe("a fluffy cat");
      expect(updated.model).toBe("gpt-image-1");
      expect(updated.quality).toBe("low");

      const untouched = await prisma.imageAsset.findUniqueOrThrow({ where: { id: images[1].id } });
      expect(untouched.prompt).toBe("a dog");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});

describe("deleteImage / addBlankImage", () => {
  it("이미지를 삭제하면 목록에서 사라진다", async () => {
    const { channel, project } = await createTestProjectWithScript(["a cat"]);
    try {
      vi.mocked(generateImage).mockResolvedValue(Buffer.from("fake-png"));
      const images = await generateImages(project.id);

      await deleteImage(project.id, images[0].id);

      const remaining = await prisma.imageAsset.findMany({ where: { projectId: project.id } });
      expect(remaining).toHaveLength(0);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("빈 카드는 파일 없이 다음 순번으로 추가된다", async () => {
    const { channel, project } = await createTestProjectWithScript(["a cat"]);
    try {
      vi.mocked(generateImage).mockResolvedValue(Buffer.from("fake-png"));
      await generateImages(project.id);

      const blank = await addBlankImage(project.id);

      expect(blank.order).toBe(1);
      expect(blank.filePath).toBeNull();
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});

describe("replaceImageFile", () => {
  it("업로드한 파일로 교체하고 model을 upload로 표시한다", async () => {
    const { channel, project } = await createTestProjectWithScript(["a cat"]);
    try {
      vi.mocked(generateImage).mockResolvedValue(Buffer.from("fake-png"));
      const images = await generateImages(project.id);

      const updated = await replaceImageFile(project.id, images[0].id, Buffer.from("uploaded-bytes"));

      expect(updated.model).toBe("upload");
      expect(updated.quality).toBeNull();
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});

describe("previewImageTransform / applyImageTransform", () => {
  afterEach(() => {
    vi.mocked(editImage).mockReset();
  });

  it("소스 이미지를 읽어 변환 결과를 base64로 반환한다 (저장하지 않음)", async () => {
    const { channel, project } = await createTestProjectWithScript(["a cat"]);
    try {
      vi.mocked(generateImage).mockResolvedValue(Buffer.from("fake-png"));
      const images = await generateImages(project.id);
      vi.mocked(editImage).mockResolvedValue(Buffer.from("transformed-png"));

      const base64 = await previewImageTransform(project.id, {
        existingImageIds: [images[0].id],
        prompt: "배경을 스튜디오로",
        modelKey: "openai-low",
        ratio: "9:16",
        resolution: "1K",
        strength: 50,
      });

      expect(base64).toBe(Buffer.from("transformed-png").toString("base64"));
      const untouched = await prisma.imageAsset.findUniqueOrThrow({ where: { id: images[0].id } });
      expect(untouched.model).toBe("gpt-image-1");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("로컬 업로드 이미지만으로도 변환할 수 있다", async () => {
    const { channel, project } = await createTestProjectWithScript(["a cat"]);
    try {
      vi.mocked(generateImage).mockResolvedValue(Buffer.from("fake-png"));
      await generateImages(project.id);
      vi.mocked(editImage).mockResolvedValue(Buffer.from("transformed-png"));

      const base64 = await previewImageTransform(project.id, {
        uploadedImages: [Buffer.from("uploaded-1"), Buffer.from("uploaded-2")],
        prompt: "배경을 스튜디오로",
        modelKey: "openai-low",
        ratio: "9:16",
        resolution: "1K",
        strength: 50,
      });

      expect(base64).toBe(Buffer.from("transformed-png").toString("base64"));
      expect(editImage).toHaveBeenCalledWith(
        [Buffer.from("uploaded-1"), Buffer.from("uploaded-2")],
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("적용하면 대상 카드의 파일이 실제로 교체된다", async () => {
    const { channel, project } = await createTestProjectWithScript(["a cat"]);
    try {
      vi.mocked(generateImage).mockResolvedValue(Buffer.from("fake-png"));
      const images = await generateImages(project.id);

      const base64 = Buffer.from("applied-png").toString("base64");
      const updated = await applyImageTransform(project.id, images[0].id, base64);

      expect(updated.model).toBe("transform");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});
