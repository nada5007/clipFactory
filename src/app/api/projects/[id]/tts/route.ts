import { NextResponse } from "next/server";
import { z } from "zod";

import { OPENAI_TTS_FORMATS } from "@/lib/voice-models";
import { createJob } from "@/server/services/job.service";
import { listAudioSegments } from "@/server/services/tts.service";
import "@/server/job-worker";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const segments = await listAudioSegments(params.id);
  return NextResponse.json(segments);
}

const ttsOptionsSchema = z.object({
  provider: z.enum(["openai", "elevenlabs"]),
  model: z.string().min(1),
  voiceId: z.string().min(1),
  settings: z
    .object({
      audioFormat: z.enum(OPENAI_TTS_FORMATS).optional(),
      instructions: z.string().max(200).optional(),
      speed: z.number().optional(),
      elevenlabs: z
        .object({
          stability: z.number().min(0).max(1),
          similarityBoost: z.number().min(0).max(1),
          style: z.number().min(0).max(1),
          speed: z.number().min(0.7).max(1.2),
        })
        .optional(),
    })
    .optional(),
});

const generateSchema = z.object({
  defaultOptions: ttsOptionsSchema.optional(),
  segmentOverrides: z.record(z.string(), ttsOptionsSchema).optional(),
});

// TTS 일괄 생성은 장시간 작업이므로 작업 레코드만 만들고 즉시 응답한다.
// 실제 실행은 job-worker의 백그라운드 폴링 루프가 담당하고,
// 진행률은 GET /api/projects/:id/events?type=TTS로 SSE 스트리밍한다.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const rawBody = await request.text();
  const body = generateSchema.safeParse(rawBody ? JSON.parse(rawBody) : {});
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const segmentOverrides = body.data.segmentOverrides
    ? Object.fromEntries(Object.entries(body.data.segmentOverrides).map(([k, v]) => [Number(k), v]))
    : undefined;

  const job = await createJob(params.id, "TTS", { defaultOptions: body.data.defaultOptions, segmentOverrides });
  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
