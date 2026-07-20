import { afterEach, describe, expect, it, vi } from "vitest";

import { generateScript } from "@/lib/clients/anthropic";
import { prisma } from "@/lib/prisma";
import { createOrRegenerateScript } from "@/server/services/script.service";

vi.mock("@/lib/clients/anthropic", () => ({
  generateScript: vi.fn(),
}));

async function createTestProject() {
  const channel = await prisma.channel.create({
    data: { name: "테스트 채널", defaultSettings: { scriptPrompt: "친근한 톤" } },
  });
  const project = await prisma.project.create({
    data: { title: "테스트 프로젝트", channelId: channel.id, videoFormat: "SHORT", settings: {} },
  });
  return { channel, project };
}

async function cleanup(projectId: string, channelId: string) {
  await prisma.script.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.channel.delete({ where: { id: channelId } });
}

describe("createOrRegenerateScript", () => {
  afterEach(() => {
    vi.mocked(generateScript).mockReset();
  });

  it("생성 성공 시 Script를 저장하고 Project.status/progress를 갱신한다", async () => {
    const { channel, project } = await createTestProject();
    try {
      vi.mocked(generateScript).mockResolvedValue({
        script: {
          title: "제목",
          hook: "후킹멘트",
          body: "대본 본문",
          imagePrompts: ["a cat", "a dog"],
        },
        model: "claude-opus-4-8",
      });

      const script = await createOrRegenerateScript(project.id, {
        topic: "테스트 주제",
        durationSeconds: 60,
        imagePromptCount: 2,
        includeChannelPrompt: true,
      });

      expect(script.title).toBe("제목");
      expect(script.imagePrompts).toEqual(["a cat", "a dog"]);

      const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(updated.status).toBe("SCRIPTING");
      expect(updated.progress).toBe(20);
      expect(updated.errorMessage).toBeNull();
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("includeChannelPrompt가 true면 채널 기본 프롬프트를 전달한다", async () => {
    const { channel, project } = await createTestProject();
    try {
      vi.mocked(generateScript).mockResolvedValue({
        script: { title: "t", hook: "h", body: "b", imagePrompts: [] },
        model: "claude-opus-4-8",
      });

      await createOrRegenerateScript(project.id, {
        topic: "테스트 주제",
        durationSeconds: 60,
        imagePromptCount: 1,
        includeChannelPrompt: true,
      });

      expect(generateScript).toHaveBeenCalledWith(
        expect.objectContaining({ channelPrompt: "친근한 톤" }),
      );
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("생성 실패 시 Project.status를 FAILED로 바꾸고 에러를 다시 던진다", async () => {
    const { channel, project } = await createTestProject();
    try {
      vi.mocked(generateScript).mockRejectedValue(new Error("API 오류"));

      await expect(
        createOrRegenerateScript(project.id, {
          topic: "테스트 주제",
          durationSeconds: 60,
          imagePromptCount: 1,
          includeChannelPrompt: false,
        }),
      ).rejects.toThrow("API 오류");

      const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(updated.status).toBe("FAILED");
      expect(updated.errorMessage).toBe("API 오류");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});
