import { NextResponse } from "next/server";
import { z } from "zod";

import { analyzeProjectHighlights } from "@/server/services/highlight.service";

const bodySchema = z.object({
  manualTranscript: z.string().optional(),
  targetDurationSec: z.number().positive().optional(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const result = await analyzeProjectHighlights(params.id, body.data);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "하이라이트 분석에 실패했습니다." },
      { status: 502 },
    );
  }
}
