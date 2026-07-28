import { NextResponse } from "next/server";

import { deleteSegment } from "@/server/services/tts.service";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; segmentId: string } },
) {
  try {
    await deleteSegment(params.id, params.segmentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제에 실패했습니다." },
      { status: 400 },
    );
  }
}
