import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { generateImage } from "@/lib/clients/image";
import { prisma } from "@/lib/prisma";
import { generateImages } from "@/server/services/image.service";

vi.mock("@/lib/clients/image", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clients/image")>("@/lib/clients/image");
  return { ...actual, generateImage: vi.fn() };
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

      await generateImages(project.id, onProgress);

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
