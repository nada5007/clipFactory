import { NextResponse } from "next/server";
import { z } from "zod";

import { reorderTrack } from "@/server/services/timeline.service";

const bodySchema = z.object({ direction: z.enum(["up", "down"]) });

// 트랙 상하 이동 — 타입 무관하게 order를 인접 트랙과 맞바꾼다(같은 타입 소스 간 표출 우선순위).
export async function POST(request: Request, { params }: { params: { id: string; trackId: string } }) {
  const body = bodySchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  try {
    await reorderTrack(params.trackId, body.data.direction);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "순서 변경에 실패했습니다." },
      { status: 400 },
    );
  }
}
