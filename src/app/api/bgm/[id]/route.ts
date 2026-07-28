import { NextResponse } from "next/server";

import { deleteBgmTrack, getBgmTrack } from "@/server/services/bgm.service";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const track = await getBgmTrack(params.id);
  if (!track) {
    return NextResponse.json({ error: "트랙을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json(track);
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await deleteBgmTrack(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제에 실패했습니다." },
      { status: 400 },
    );
  }
}
