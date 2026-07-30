import { NextResponse } from "next/server";

import { removeTrack } from "@/server/services/timeline.service";

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
