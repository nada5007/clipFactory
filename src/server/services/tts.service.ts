import type { Prisma } from "@prisma/client";

import { synthesizeSpeechWithOpenAi } from "@/lib/clients/openai-tts";
import { DEFAULT_MODEL_ID, DEFAULT_VOICE_ID, synthesizeSpeech } from "@/lib/clients/tts";
import { getAudioDurationMs } from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { deleteProjectFile, resolveProjectFilePath, writeProjectFile } from "@/lib/storage";
import { splitIntoSentences } from "@/lib/text";
import type { ElevenLabsVoiceSettings, OpenAiTtsFormat, OpenAiTtsModel, TtsProvider } from "@/lib/voice-models";
import type { JobProgressReporter } from "@/server/services/job.service";

const TTS_PROGRESS = 60;

export type TtsSegmentSettings = {
  audioFormat?: OpenAiTtsFormat;
  instructions?: string;
  speed?: number;
  elevenlabs?: ElevenLabsVoiceSettings;
};

export type TtsGenerationOptions = {
  provider: TtsProvider;
  model: string;
  voiceId: string;
  settings?: TtsSegmentSettings;
};

const DEFAULT_TTS_OPTIONS: TtsGenerationOptions = {
  provider: "elevenlabs",
  model: DEFAULT_MODEL_ID,
  voiceId: DEFAULT_VOICE_ID,
};

export function listAudioSegments(projectId: string) {
  return prisma.audioSegment.findMany({ where: { projectId }, orderBy: { order: "asc" } });
}

export function getAudioSegment(projectId: string, segmentId: string) {
  return prisma.audioSegment.findFirst({ where: { id: segmentId, projectId } });
}

// ElevenLabs는 항상 mp3만 반환한다. OpenAI는 요청한 오디오 포맷(mp3/wav/ogg)을 그대로 반환하므로
// 저장 파일 확장자도 실제 포맷과 맞춰야 <audio> 재생이 깨지지 않는다.
function resolveAudioExtension(options: TtsGenerationOptions): string {
  if (options.provider === "openai") {
    return options.settings?.audioFormat ?? "mp3";
  }
  return "mp3";
}

async function synthesizeWithProvider(text: string, options: TtsGenerationOptions): Promise<Buffer> {
  if (options.provider === "openai") {
    return synthesizeSpeechWithOpenAi({
      text,
      voice: options.voiceId,
      model: options.model as OpenAiTtsModel,
      format: options.settings?.audioFormat ?? "mp3",
      instructions: options.settings?.instructions,
      speed: options.settings?.speed,
    });
  }
  return synthesizeSpeech(text, {
    voiceId: options.voiceId,
    modelId: options.model,
    settings: options.settings?.elevenlabs,
  });
}

// 삭제/재생성으로 세그먼트 파일이 바뀌면 이후 세그먼트들의 startMs/endMs가 어긋나므로,
// 실제 오디오 파일 길이를 다시 재서 순서대로 누적 계산한다.
async function recomputeTimings(projectId: string) {
  const segments = await prisma.audioSegment.findMany({ where: { projectId }, orderBy: { order: "asc" } });

  let cursorMs = 0;
  for (const segment of segments) {
    const durationMs = await getAudioDurationMs(resolveProjectFilePath(projectId, segment.filePath));
    const newStart = cursorMs;
    const newEnd = cursorMs + durationMs;
    if (newStart !== segment.startMs || newEnd !== segment.endMs) {
      await prisma.audioSegment.update({
        where: { id: segment.id },
        data: { startMs: newStart, endMs: newEnd },
      });
    }
    cursorMs = newEnd;
  }
}

export type GenerateAudioSegmentsInput = {
  defaultOptions?: TtsGenerationOptions;
  segmentOverrides?: Record<number, TtsGenerationOptions>;
};

// PROJECT_SPEC.md §1.3 "TTS 탭 전체 확장": 프로바이더/모델/음성을 선택할 수 있고,
// 세그먼트별로 다른 설정을 일괄 적용할 수 있다. 문장 분리는 splitIntoSentences(.!?。！？ 기준)를 그대로 쓴다.
export async function generateAudioSegments(
  projectId: string,
  input?: GenerateAudioSegmentsInput,
  onProgress?: JobProgressReporter,
) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { script: true },
  });

  if (!project.script) {
    throw new Error("스크립트가 없어 TTS를 생성할 수 없습니다. 먼저 스크립트를 생성해주세요.");
  }

  const sentences = splitIntoSentences(project.script.body);
  if (sentences.length === 0) {
    throw new Error("대본 본문에서 문장을 찾을 수 없습니다.");
  }

  const defaultOptions = input?.defaultOptions ?? DEFAULT_TTS_OPTIONS;

  try {
    await prisma.audioSegment.deleteMany({ where: { projectId } });

    let cursorMs = 0;
    const segments = [];
    for (let order = 0; order < sentences.length; order++) {
      const text = sentences[order];
      const options = input?.segmentOverrides?.[order] ?? defaultOptions;
      const audio = await synthesizeWithProvider(text, options);
      const relativePath = `audio/${order}.${resolveAudioExtension(options)}`;
      await writeProjectFile(projectId, relativePath, audio);
      const durationMs = await getAudioDurationMs(resolveProjectFilePath(projectId, relativePath));

      const segment = await prisma.audioSegment.create({
        data: {
          projectId,
          order,
          text,
          startMs: cursorMs,
          endMs: cursorMs + durationMs,
          filePath: relativePath,
          provider: options.provider,
          voiceId: options.voiceId,
          model: options.model,
          settings: (options.settings ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      cursorMs += durationMs;
      segments.push(segment);
      await onProgress?.(
        Math.round(((order + 1) / sentences.length) * 100),
        `TTS ${order + 1}/${sentences.length} 생성 완료`,
      );
    }

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "TTS",
        progress: Math.max(project.progress, TTS_PROGRESS),
        errorMessage: null,
      },
    });

    return segments;
  } catch (error) {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "TTS 생성 중 오류가 발생했습니다.",
      },
    });
    throw error;
  }
}

// 세그먼트 카드 "재생성": 텍스트는 그대로 두고(또는 명시적으로 바꾸고) 음성/설정만 바꿔 다시 합성한다.
export async function regenerateSegment(
  projectId: string,
  segmentId: string,
  input: { text?: string; options: TtsGenerationOptions },
) {
  const existing = await prisma.audioSegment.findFirstOrThrow({ where: { id: segmentId, projectId } });
  const text = input.text ?? existing.text;
  const buffer = await synthesizeWithProvider(text, input.options);

  const relativePath = `audio/${existing.order}.${resolveAudioExtension(input.options)}`;
  await writeProjectFile(projectId, relativePath, buffer);
  if (relativePath !== existing.filePath) {
    await deleteProjectFile(projectId, existing.filePath);
  }

  await prisma.audioSegment.update({
    where: { id: segmentId },
    data: {
      text,
      filePath: relativePath,
      provider: input.options.provider,
      voiceId: input.options.voiceId,
      model: input.options.model,
      settings: (input.options.settings ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  await recomputeTimings(projectId);
  return prisma.audioSegment.findUniqueOrThrow({ where: { id: segmentId } });
}

// 세그먼트 카드 "삭제": 파일도 함께 지우고, 이후 세그먼트들의 타이밍을 다시 맞춘다.
export async function deleteSegment(projectId: string, segmentId: string) {
  const existing = await prisma.audioSegment.findFirst({ where: { id: segmentId, projectId } });
  if (!existing) {
    throw new Error("세그먼트를 찾을 수 없습니다.");
  }
  await deleteProjectFile(projectId, existing.filePath);
  await prisma.audioSegment.delete({ where: { id: segmentId } });
  await recomputeTimings(projectId);
}
