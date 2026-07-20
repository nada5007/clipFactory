import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { getThumbnail, readThumbnailFile, saveThumbnail } from "@/server/services/thumbnail.service";

async function createTestProject() {
  const channel = await prisma.channel.create({ data: { name: "썸네일테스트 채널", defaultSettings: {} } });
  const project = await prisma.project.create({
    data: { title: "썸네일테스트 프로젝트", channelId: channel.id, videoFormat: "SHORT", settings: {} },
  });
  return { channel, project };
}

async function cleanup(projectId: string, channelId: string) {
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.channel.delete({ where: { id: channelId } });
  await fs.rm(path.join(process.cwd(), "storage", projectId), { recursive: true, force: true });
}

describe("thumbnail.service", () => {
  it("썸네일을 저장하면 파일과 DB 레코드가 함께 생성된다", async () => {
    const { channel, project } = await createTestProject();
    try {
      const fakePng = Buffer.from("fake-png-bytes");
      const record = await saveThumbnail(project.id, fakePng, { width: 1080, height: 1920 });

      expect(record.width).toBe(1080);
      expect(record.height).toBe(1920);

      const stored = await getThumbnail(project.id);
      expect(stored?.id).toBe(record.id);

      const fileContent = await readThumbnailFile(project.id);
      expect(fileContent.toString()).toBe("fake-png-bytes");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("다시 저장하면 기존 레코드를 덮어쓴다 (프로젝트당 1개)", async () => {
    const { channel, project } = await createTestProject();
    try {
      const first = await saveThumbnail(project.id, Buffer.from("v1"), { width: 1080, height: 1920 });
      const second = await saveThumbnail(project.id, Buffer.from("v2"), { width: 1280, height: 720 });

      expect(second.id).toBe(first.id);
      expect(second.width).toBe(1280);

      const fileContent = await readThumbnailFile(project.id);
      expect(fileContent.toString()).toBe("v2");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("저장된 썸네일이 없으면 null을 반환한다", async () => {
    const { channel, project } = await createTestProject();
    try {
      expect(await getThumbnail(project.id)).toBeNull();
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});
