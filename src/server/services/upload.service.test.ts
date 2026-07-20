import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadVideo } from "@/lib/clients/youtube";
import { prisma } from "@/lib/prisma";
import { writeProjectFile } from "@/lib/storage";
import { getValidAccessToken } from "@/server/services/channel-oauth.service";
import { resolveUploadMetadata, saveUploadConfig, uploadToYoutube } from "@/server/services/upload.service";

vi.mock("@/lib/clients/youtube", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clients/youtube")>("@/lib/clients/youtube");
  return { ...actual, uploadVideo: vi.fn() };
});
vi.mock("@/server/services/channel-oauth.service", () => ({
  getValidAccessToken: vi.fn(),
}));

describe("resolveUploadMetadata", () => {
  it("업로드 설정이 비어 있으면 프로젝트 제목/설명으로 대체한다", () => {
    const result = resolveUploadMetadata(
      { title: "프로젝트 제목", description: "프로젝트 설명" },
      null,
    );
    expect(result).toEqual({
      title: "프로젝트 제목",
      description: "프로젝트 설명",
      tags: [],
      privacyStatus: "private",
    });
  });

  it("업로드 설정 값이 있으면 그 값을 우선한다", () => {
    const result = resolveUploadMetadata(
      { title: "프로젝트 제목", description: "프로젝트 설명" },
      { title: "업로드 제목", description: "업로드 설명", tags: ["a", "b"], privacyStatus: "PUBLIC" },
    );
    expect(result).toEqual({
      title: "업로드 제목",
      description: "업로드 설명",
      tags: ["a", "b"],
      privacyStatus: "public",
    });
  });

  it("공백뿐인 제목/설명은 무시하고 프로젝트 값으로 대체한다", () => {
    const result = resolveUploadMetadata(
      { title: "프로젝트 제목", description: "프로젝트 설명" },
      { title: "   ", description: "  ", tags: [], privacyStatus: "PRIVATE" },
    );
    expect(result.title).toBe("프로젝트 제목");
    expect(result.description).toBe("프로젝트 설명");
  });

  it("scheduledPublishAt이 있으면 ISO 문자열 publishAt을 반환한다", () => {
    const result = resolveUploadMetadata(
      { title: "프로젝트 제목", description: "프로젝트 설명" },
      {
        title: null,
        description: null,
        tags: [],
        privacyStatus: "PUBLIC",
        scheduledPublishAt: new Date("2026-06-01T00:00:00.000Z"),
      },
    );
    expect(result.publishAt).toBe("2026-06-01T00:00:00.000Z");
  });
});

describe("saveUploadConfig", () => {
  it("15분 미만 여유의 예약 시각은 에러를 던진다", async () => {
    const channel = await prisma.channel.create({ data: { name: "예약테스트 채널", defaultSettings: {} } });
    const project = await prisma.project.create({
      data: { title: "예약테스트 프로젝트", channelId: channel.id, videoFormat: "SHORT", settings: {} },
    });
    try {
      const soon = new Date(Date.now() + 5 * 60 * 1000);
      await expect(saveUploadConfig(project.id, { scheduledPublishAt: soon })).rejects.toThrow(
        "예약 시각은 최소 15분 이후여야 합니다.",
      );
    } finally {
      await prisma.uploadConfig.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.channel.delete({ where: { id: channel.id } });
    }
  });

  it("15분 이상 여유의 예약 시각은 저장된다", async () => {
    const channel = await prisma.channel.create({ data: { name: "예약테스트 채널2", defaultSettings: {} } });
    const project = await prisma.project.create({
      data: { title: "예약테스트 프로젝트2", channelId: channel.id, videoFormat: "SHORT", settings: {} },
    });
    try {
      const future = new Date(Date.now() + 60 * 60 * 1000);
      const config = await saveUploadConfig(project.id, { scheduledPublishAt: future });
      expect(config.scheduledPublishAt?.toISOString()).toBe(future.toISOString());
    } finally {
      await prisma.uploadConfig.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.channel.delete({ where: { id: channel.id } });
    }
  });
});

async function createTestProjectWithVideo() {
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
      imagePrompts: [],
      model: "claude-opus-4-8",
    },
  });
  await prisma.videoAsset.create({
    data: {
      projectId: project.id,
      filePath: "video.mp4",
      subtitlePath: "subtitles.srt",
      durationMs: 3000,
      width: 1080,
      height: 1920,
    },
  });
  await writeProjectFile(project.id, "video.mp4", Buffer.from("fake-video-bytes"));
  return { channel, project };
}

async function cleanup(projectId: string, channelId: string) {
  await prisma.uploadConfig.deleteMany({ where: { projectId } });
  await prisma.videoAsset.deleteMany({ where: { projectId } });
  await prisma.script.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.channel.delete({ where: { id: channelId } });
  await fs.rm(path.join(process.cwd(), "storage", projectId), { recursive: true, force: true });
}

describe("uploadToYoutube", () => {
  afterEach(() => {
    vi.mocked(uploadVideo).mockReset();
    vi.mocked(getValidAccessToken).mockReset();
  });

  it("성공 시 UploadConfig를 저장하고 Project.status/progress를 갱신한다", async () => {
    const { channel, project } = await createTestProjectWithVideo();
    try {
      vi.mocked(getValidAccessToken).mockResolvedValue("fake-access-token");
      vi.mocked(uploadVideo).mockResolvedValue({ videoId: "abc123" });

      const config = await uploadToYoutube(project.id);

      expect(config.youtubeVideoId).toBe("abc123");
      expect(uploadVideo).toHaveBeenCalledWith(
        "fake-access-token",
        expect.objectContaining({ title: "테스트 프로젝트" }),
        expect.any(Buffer),
      );

      const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(updated.status).toBe("UPLOADED");
      expect(updated.progress).toBe(100);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("영상이 없으면 에러를 던진다", async () => {
    const channel = await prisma.channel.create({ data: { name: "테스트 채널2", defaultSettings: {} } });
    const project = await prisma.project.create({
      data: { title: "영상 없는 프로젝트", channelId: channel.id, videoFormat: "SHORT", settings: {} },
    });
    await prisma.script.create({
      data: {
        projectId: project.id,
        topic: "주제",
        title: "제목",
        hook: "훅",
        body: "본문",
        imagePrompts: [],
        model: "claude-opus-4-8",
      },
    });
    try {
      await expect(uploadToYoutube(project.id)).rejects.toThrow("렌더링된 영상이 없어");
    } finally {
      await prisma.script.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.channel.delete({ where: { id: channel.id } });
    }
  });

  it("업로드 실패 시 Project.status를 FAILED로 바꾼다", async () => {
    const { channel, project } = await createTestProjectWithVideo();
    try {
      vi.mocked(getValidAccessToken).mockResolvedValue("fake-access-token");
      vi.mocked(uploadVideo).mockRejectedValue(new Error("YouTube 업로드 실패"));

      await expect(uploadToYoutube(project.id)).rejects.toThrow("YouTube 업로드 실패");

      const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(updated.status).toBe("FAILED");
      expect(updated.errorMessage).toBe("YouTube 업로드 실패");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});
