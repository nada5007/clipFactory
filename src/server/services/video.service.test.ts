import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildImageSlideshow, concatAudioFiles, muxVideoAudio } from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { renderVideo } from "@/server/services/video.service";

vi.mock("@/lib/ffmpeg", () => ({
  concatAudioFiles: vi.fn().mockResolvedValue(undefined),
  buildImageSlideshow: vi.fn().mockResolvedValue(undefined),
  muxVideoAudio: vi.fn().mockResolvedValue(undefined),
}));

async function createProjectWithAssets(options: { audio: boolean; images: boolean }) {
  const channel = await prisma.channel.create({ data: { name: "테스트 채널", defaultSettings: {} } });
  const project = await prisma.project.create({
    data: { title: "테스트 프로젝트", channelId: channel.id, videoFormat: "SHORT", settings: {} },
  });

  if (options.audio) {
    await prisma.audioSegment.createMany({
      data: [
        {
          projectId: project.id,
          order: 0,
          text: "첫 문장",
          startMs: 0,
          endMs: 1000,
          filePath: "audio/0.mp3",
          provider: "elevenlabs",
          voiceId: "v1",
          model: "m1",
        },
        {
          projectId: project.id,
          order: 1,
          text: "둘째 문장",
          startMs: 1000,
          endMs: 2500,
          filePath: "audio/1.mp3",
          provider: "elevenlabs",
          voiceId: "v1",
          model: "m1",
        },
      ],
    });
  }

  if (options.images) {
    await prisma.imageAsset.createMany({
      data: [
        {
          projectId: project.id,
          order: 0,
          prompt: "a cat",
          filePath: "images/0.png",
          model: "gpt-image-1",
          size: "1024x1536",
        },
      ],
    });
  }

  return { channel, project };
}

async function cleanup(projectId: string, channelId: string) {
  await prisma.videoAsset.deleteMany({ where: { projectId } });
  await prisma.imageAsset.deleteMany({ where: { projectId } });
  await prisma.audioSegment.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.channel.delete({ where: { id: channelId } });
  await fs.rm(path.join(process.cwd(), "storage", projectId), { recursive: true, force: true });
}

describe("renderVideo", () => {
  afterEach(() => {
    vi.mocked(concatAudioFiles).mockClear();
    vi.mocked(buildImageSlideshow).mockClear();
    vi.mocked(muxVideoAudio).mockClear();
  });

  it("성공 시 VideoAsset을 생성하고 Project.status/progress를 갱신한다", async () => {
    const { channel, project } = await createProjectWithAssets({ audio: true, images: true });
    try {
      const video = await renderVideo(project.id);

      expect(video.durationMs).toBe(2500);
      expect(video.width).toBe(1080);
      expect(video.height).toBe(1920);
      expect(video.filePath).toBe("video.mp4");
      expect(video.subtitlePath).toBe("subtitles.srt");

      expect(concatAudioFiles).toHaveBeenCalledTimes(1);
      expect(buildImageSlideshow).toHaveBeenCalledTimes(1);
      expect(muxVideoAudio).toHaveBeenCalledTimes(1);

      const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(updated.status).toBe("RENDERED");
      expect(updated.progress).toBe(80);

      const srt = await fs.readFile(
        path.join(process.cwd(), "storage", project.id, "subtitles.srt"),
        "utf-8",
      );
      expect(srt).toContain("첫 문장");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("단계별로 onProgress 콜백을 호출한다", async () => {
    const { channel, project } = await createProjectWithAssets({ audio: true, images: true });
    try {
      const onProgress = vi.fn();

      await renderVideo(project.id, onProgress);

      expect(onProgress).toHaveBeenCalledWith(5, expect.any(String));
      expect(onProgress).toHaveBeenCalledWith(30, expect.any(String));
      expect(onProgress).toHaveBeenCalledWith(70, expect.any(String));
      expect(onProgress).toHaveBeenCalledWith(90, expect.any(String));
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("TTS 음성이 없으면 에러를 던진다", async () => {
    const { channel, project } = await createProjectWithAssets({ audio: false, images: true });
    try {
      await expect(renderVideo(project.id)).rejects.toThrow("TTS 음성이 없어");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("이미지가 없으면 에러를 던진다", async () => {
    const { channel, project } = await createProjectWithAssets({ audio: true, images: false });
    try {
      await expect(renderVideo(project.id)).rejects.toThrow("이미지가 없어");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("렌더링 실패 시 Project.status를 FAILED로 바꾼다", async () => {
    const { channel, project } = await createProjectWithAssets({ audio: true, images: true });
    try {
      vi.mocked(muxVideoAudio).mockRejectedValueOnce(new Error("ffmpeg 실패"));

      await expect(renderVideo(project.id)).rejects.toThrow("ffmpeg 실패");

      const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(updated.status).toBe("FAILED");
      expect(updated.errorMessage).toBe("ffmpeg 실패");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});
