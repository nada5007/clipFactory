import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { synthesizeSpeech } from "@/lib/clients/tts";
import { getAudioDurationMs } from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { generateAudioSegments } from "@/server/services/tts.service";

vi.mock("@/lib/clients/tts", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clients/tts")>("@/lib/clients/tts");
  return { ...actual, synthesizeSpeech: vi.fn() };
});
vi.mock("@/lib/ffmpeg", () => ({ getAudioDurationMs: vi.fn() }));

async function createTestProjectWithScript(body: string) {
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
      body,
      imagePrompts: [],
      model: "claude-opus-4-8",
    },
  });
  return { channel, project };
}

async function cleanup(projectId: string, channelId: string) {
  await prisma.audioSegment.deleteMany({ where: { projectId } });
  await prisma.script.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.channel.delete({ where: { id: channelId } });
  await fs.rm(path.join(process.cwd(), "storage", projectId), { recursive: true, force: true });
}

describe("generateAudioSegments", () => {
  afterEach(() => {
    vi.mocked(synthesizeSpeech).mockReset();
    vi.mocked(getAudioDurationMs).mockReset();
  });

  it("문장별 세그먼트를 생성하고 시작/종료 시각을 순차 누적한다", async () => {
    const { channel, project } = await createTestProjectWithScript("첫 문장. 둘째 문장.");
    try {
      vi.mocked(synthesizeSpeech).mockResolvedValue(Buffer.from("fake-audio"));
      vi.mocked(getAudioDurationMs).mockResolvedValueOnce(1000).mockResolvedValueOnce(1500);

      const segments = await generateAudioSegments(project.id);

      expect(segments).toHaveLength(2);
      expect(segments[0]).toMatchObject({ order: 0, text: "첫 문장.", startMs: 0, endMs: 1000 });
      expect(segments[1]).toMatchObject({ order: 1, text: "둘째 문장.", startMs: 1000, endMs: 2500 });

      const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(updated.status).toBe("TTS");
      expect(updated.progress).toBe(60);
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
      await expect(generateAudioSegments(project.id)).rejects.toThrow("스크립트가 없어");
    } finally {
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.channel.delete({ where: { id: channel.id } });
    }
  });

  it("생성 실패 시 Project.status를 FAILED로 바꾼다", async () => {
    const { channel, project } = await createTestProjectWithScript("문장 하나.");
    try {
      vi.mocked(synthesizeSpeech).mockRejectedValue(new Error("TTS API 오류"));

      await expect(generateAudioSegments(project.id)).rejects.toThrow("TTS API 오류");

      const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(updated.status).toBe("FAILED");
      expect(updated.errorMessage).toBe("TTS API 오류");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});
