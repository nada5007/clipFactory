import { NextResponse } from "next/server";
import { z } from "zod";

import { removeTrack, updateTrackFlags } from "@/server/services/timeline.service";

const patchSchema = z.object({ visible: z.boolean(), locked: z.boolean() }).partial();

// 트랙 헤더의 보이기/숨기기·잠금 토글.
export async function PATCH(request: Request, { params }: { params: { id: string; trackId: string } }) {
  const body = patchSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  try {
    const track = await updateTrackFlags(params.trackId, body.data);
    return NextResponse.json(track);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "트랙 수정에 실패했습니다." },
      { status: 400 },
    );
  }
}

// 트랙 삭제 — 자동 생성된 트랙(autoSync=true)은 서비스 레이어에서 거부한다.
export async function DELETE(_request: Request, { params }: { params: { id: string; trackId: string } }) {
  try {
    await removeTrack(params.trackId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "트랙 삭제에 실패했습니다." },
      { status: 400 },
    );
  }
}
