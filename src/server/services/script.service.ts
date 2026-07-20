import type { Prisma } from "@prisma/client";

import { generateScript } from "@/lib/clients/anthropic";
import { prisma } from "@/lib/prisma";

const SCRIPT_PROGRESS = 20;

export function getScript(projectId: string) {
  return prisma.script.findUnique({ where: { projectId } });
}

export async function createOrRegenerateScript(
  projectId: string,
  input: {
    topic: string;
    durationSeconds: number;
    imagePromptCount: number;
    includeChannelPrompt: boolean;
  },
) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { channel: true },
  });

  const channelSettings = project.channel.defaultSettings as { scriptPrompt?: string } | null;
  const channelPrompt = input.includeChannelPrompt ? channelSettings?.scriptPrompt : undefined;

  try {
    const { script, model } = await generateScript({
      topic: input.topic,
      durationSeconds: input.durationSeconds,
      imagePromptCount: input.imagePromptCount,
      channelPrompt,
    });

    const [savedScript] = await prisma.$transaction([
      prisma.script.upsert({
        where: { projectId },
        create: {
          projectId,
          topic: input.topic,
          title: script.title,
          hook: script.hook,
          body: script.body,
          imagePrompts: script.imagePrompts,
          model,
        },
        update: {
          topic: input.topic,
          title: script.title,
          hook: script.hook,
          body: script.body,
          imagePrompts: script.imagePrompts,
          model,
        },
      }),
      prisma.project.update({
        where: { id: projectId },
        data: {
          status: "SCRIPTING",
          progress: Math.max(project.progress, SCRIPT_PROGRESS),
          errorMessage: null,
        },
      }),
    ]);

    return savedScript;
  } catch (error) {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "스크립트 생성 중 오류가 발생했습니다.",
      },
    });
    throw error;
  }
}

export function updateScript(
  projectId: string,
  input: { title?: string; hook?: string; body?: string; imagePrompts?: Prisma.InputJsonValue },
) {
  return prisma.script.update({ where: { projectId }, data: input });
}
