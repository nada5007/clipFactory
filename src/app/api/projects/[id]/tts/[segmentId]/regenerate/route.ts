import { NextResponse } from "next/server";
import { z } from "zod";

import { OPENAI_TTS_FORMATS } from "@/lib/voice-models";
import { regenerateSegment } from "@/server/services/tts.service";

const regenerateSchema = z.object({
  text: z.string().optional(),
  options: z.object({
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
  }),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string; segmentId: string } },
) {
  const body = regenerateSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const segment = await regenerateSegment(params.id, params.segmentId, body.data);
    return NextResponse.json(segment);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "재생성에 실패했습니다." },
      { status: 502 },
    );
  }
}
