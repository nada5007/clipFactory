import { NextResponse } from "next/server";
import { z } from "zod";

import { addTtsBreathingGaps } from "@/server/services/timeline.service";

const schema = z.object({ gapMs: z.number().int().min(50).max(2000) });

// TTS 호흡구간 추가: TTS·자막 클립을 함께 밀어내 싱크를 유지한다.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const timeline = await addTtsBreathingGaps(params.id, body.data.gapMs);
    return NextResponse.json(timeline);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "호흡구간 추가에 실패했습니다." },
      { status: 400 },
    );
  }
}
