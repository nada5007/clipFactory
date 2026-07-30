import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { uploadMedia } from "@/server/services/media.service";

async function createProject() {
  const channel = await prisma.channel.create({ data: { name: "테스트 채널", defaultSettings: {} } });
  const project = await prisma.project.create({
    data: { title: "테스트 프로젝트", channelId: channel.id, videoFormat: "SHORT", settings: {} },
  });
  return { channel, project };
}

async function cleanup(projectId: string, channelId: string) {
  await prisma.uploadedMedia.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.channel.delete({ where: { id: channelId } });
  await fs.rm(path.join(process.cwd(), "storage", projectId), { recursive: true, force: true });
}

describe("uploadMedia", () => {
  let cleanupQueue: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const fn of cleanupQueue) await fn();
    cleanupQueue = [];
  });

  it("이미지 파일을 저장하고 UploadedMedia 레코드를 만든다(길이는 null)", async () => {
    const { channel, project } = await createProject();
    cleanupQueue.push(() => cleanup(project.id, channel.id));

    const media = await uploadMedia(project.id, "image", { buffer: Buffer.from([1, 2, 3]), mimeType: "image/png" });

    expect(media.kind).toBe("image");
    expect(media.durationMs).toBeNull();
    expect(media.filePath).toMatch(/^uploads\/image_.*\.png$/);

    const written = await fs.readFile(path.join(process.cwd(), "storage", project.id, media.filePath));
    expect(written).toEqual(Buffer.from([1, 2, 3]));
  });

  it("허용하지 않는 MIME 타입은 거부한다", async () => {
    const { channel, project } = await createProject();
    cleanupQueue.push(() => cleanup(project.id, channel.id));

    await expect(
      uploadMedia(project.id, "image", { buffer: Buffer.from([1]), mimeType: "application/pdf" }),
    ).rejects.toThrow("지원하지 않는 파일 형식");
  });

  it("용량 제한을 초과하면 거부한다", async () => {
    const { channel, project } = await createProject();
    cleanupQueue.push(() => cleanup(project.id, channel.id));

    const oversized = Buffer.alloc(11 * 1024 * 1024); // 이미지 제한 10MB 초과
    await expect(uploadMedia(project.id, "image", { buffer: oversized, mimeType: "image/png" })).rejects.toThrow(
      "너무 큽니다",
    );
  });
});
