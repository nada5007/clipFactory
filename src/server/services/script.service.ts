import type { Prisma } from "@prisma/client";
import type { z } from "zod";

import { generateJsonWithAnthropic, generateScript } from "@/lib/clients/anthropic";
import { generateJsonWithGemini } from "@/lib/clients/gemini";
import { generateJsonWithOpenAi } from "@/lib/clients/openai-text";
import { generateJsonWithXai } from "@/lib/clients/xai";
import { getLlmModelOption, type LlmModelOption } from "@/lib/llm-models";
import { prisma } from "@/lib/prisma";
import { buildScriptFieldPrompt, SCRIPT_FIELD_SCHEMAS, type ScriptField, type ScriptFieldContext } from "@/lib/script-fields";

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

async function callLlmProvider<T>(
  model: LlmModelOption,
  system: string,
  user: string,
  schema: z.ZodType<T>,
): Promise<T> {
  switch (model.provider) {
    case "anthropic":
      return generateJsonWithAnthropic(model.id, system, user, schema);
    case "openai":
      return generateJsonWithOpenAi(model.id, system, user, schema);
    case "xai":
      return generateJsonWithXai(model.id, system, user, schema);
    case "google":
      return generateJsonWithGemini(model.id, system, user, schema);
  }
}

// PROJECT_SPEC.md §1.3 "스크립트 탭 — UI 전체 확장 요구사항": 제목/후킹멘트/대본/이미지프롬프트를
// 필드 단위로, 선택한 LLM 모델과 커스텀 프롬프트를 반영해 재생성한다.
export async function regenerateScriptField(
  projectId: string,
  input: { field: ScriptField; customPrompt?: string; modelId: string },
) {
  const script = await prisma.script.findUniqueOrThrow({ where: { projectId } });
  const model = getLlmModelOption(input.modelId);
  const imagePrompts = Array.isArray(script.imagePrompts) ? (script.imagePrompts as string[]) : [];

  const context: ScriptFieldContext = {
    topic: script.topic,
    title: script.title,
    hook: script.hook,
    body: script.body,
    imagePrompts,
  };
  const { system, user } = buildScriptFieldPrompt(input.field, context, input.customPrompt);

  switch (input.field) {
    case "title": {
      const result = await callLlmProvider(model, system, user, SCRIPT_FIELD_SCHEMAS.title);
      return prisma.script.update({ where: { projectId }, data: { title: result.title } });
    }
    case "hook": {
      const result = await callLlmProvider(model, system, user, SCRIPT_FIELD_SCHEMAS.hook);
      return prisma.script.update({ where: { projectId }, data: { hook: result.hook } });
    }
    case "body": {
      const result = await callLlmProvider(model, system, user, SCRIPT_FIELD_SCHEMAS.body);
      return prisma.script.update({ where: { projectId }, data: { body: result.body } });
    }
    case "imagePrompts": {
      const result = await callLlmProvider(model, system, user, SCRIPT_FIELD_SCHEMAS.imagePrompts);
      return prisma.script.update({
        where: { projectId },
        data: { imagePrompts: result.imagePrompts as Prisma.InputJsonValue },
      });
    }
  }
}
