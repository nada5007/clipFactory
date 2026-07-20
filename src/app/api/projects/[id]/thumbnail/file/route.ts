import { NextResponse } from "next/server";

import { getThumbnail, readThumbnailFile } from "@/server/services/thumbnail.service";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const thumbnail = await getThumbnail(params.id);
  if (!thumbnail) {
    return NextResponse.json({ error: "썸네일을 찾을 수 없습니다." }, { status: 404 });
  }

  const file = await readThumbnailFile(params.id);
  return new NextResponse(new Uint8Array(file), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" },
  });
}
