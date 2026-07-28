import { NextResponse } from "next/server";

import { getBgmTrack, readBgmTrackFile } from "@/server/services/bgm.service";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const track = await getBgmTrack(params.id);
  if (!track) {
    return NextResponse.json({ error: "트랙을 찾을 수 없습니다." }, { status: 404 });
  }

  const audio = await readBgmTrackFile(track);
  return new NextResponse(new Uint8Array(audio), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
  });
}
