import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { deleteProject } from "@/server/services/project.service";

describe("deleteProject", () => {
  it("연관 레코드(Script/이미지/오디오/영상/Job/UploadConfig)가 있어도 FK 오류 없이 삭제된다", async () => {
    const channel = await prisma.channel.create({ data: { name: "삭제테스트 채널", defaultSettings: {} } });
    const project = await prisma.project.create({
      data: { title: "삭제테스트 프로젝트", channelId: channel.id, videoFormat: "SHORT", settings: {} },
    });

    await prisma.script.create({
      data: { projectId: project.id, topic: "주제", title: "제목", hook: "훅", body: "본문", imagePrompts: [], model: "claude-opus-4-8" },
    });
    await prisma.imageAsset.create({
      data: { projectId: project.id, order: 0, prompt: "p", filePath: "0.png", model: "gpt-image-1", size: "1024x1024" },
    });
    await prisma.audioSegment.create({
      data: { projectId: project.id, order: 0, text: "t", startMs: 0, endMs: 100, filePath: "0.mp3", provider: "elevenlabs", voiceId: "v1", model: "m1" },
    });
    await prisma.videoAsset.create({
      data: { projectId: project.id, filePath: "video.mp4", subtitlePath: "subtitles.srt", durationMs: 1000, width: 1080, height: 1920 },
    });
    await prisma.job.create({ data: { projectId: project.id, type: "RENDER" } });
    await prisma.uploadConfig.create({ data: { projectId: project.id, tags: [] } });

    await expect(deleteProject(project.id)).resolves.toBeDefined();

    const remaining = await prisma.project.findUnique({ where: { id: project.id } });
    expect(remaining).toBeNull();

    await prisma.channel.delete({ where: { id: channel.id } });
  });
});
