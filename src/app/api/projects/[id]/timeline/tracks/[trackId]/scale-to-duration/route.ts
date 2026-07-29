import { NextResponse } from "next/server";
import { z } from "zod";

import { scaleTrackToTargetDuration } from "@/server/services/timeline.service";

const schema = z.object({ targetDurationMs: z.number().int().min(1) });

// "목표 길이 맞추기": 트랙 전체를 비례 스케일한다.
export async function POST(request: Request, { params }: { params: { id: string; trackId: string } }) {
  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    await scaleTrackToTargetDuration(params.trackId, body.data.targetDurationMs);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "길이 조정에 실패했습니다." },
      { status: 400 },
    );
  }
}
