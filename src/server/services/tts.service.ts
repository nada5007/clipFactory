import { DEFAULT_MODEL_ID, DEFAULT_VOICE_ID, TTS_PROVIDER, synthesizeSpeech } from "@/lib/clients/tts";
import { getAudioDurationMs } from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { resolveProjectFilePath, writeProjectFile } from "@/lib/storage";
import { splitIntoSentences } from "@/lib/text";

const TTS_PROGRESS = 60;

export function listAudioSegments(projectId: string) {
  return prisma.audioSegment.findMany({ where: { projectId }, orderBy: { order: "asc" } });
}

export function getAudioSegment(projectId: string, segmentId: string) {
  return prisma.audioSegment.findFirst({ where: { id: segmentId, projectId } });
}

export async function generateAudioSegments(projectId: string) {
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

  try {
    await prisma.audioSegment.deleteMany({ where: { projectId } });

    let cursorMs = 0;
    const segments = [];
    for (let order = 0; order < sentences.length; order++) {
      const text = sentences[order];
      const audio = await synthesizeSpeech(text);
      const relativePath = `audio/${order}.mp3`;
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
          provider: TTS_PROVIDER,
          voiceId: DEFAULT_VOICE_ID,
          model: DEFAULT_MODEL_ID,
        },
      });
      cursorMs += durationMs;
      segments.push(segment);
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
