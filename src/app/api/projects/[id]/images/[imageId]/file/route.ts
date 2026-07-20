import { NextResponse } from "next/server";

import { readProjectFile } from "@/lib/storage";
import { getImage } from "@/server/services/image.service";

export async function GET(
  _request: Request,
  { params }: { params: { id: string; imageId: string } },
) {
  const image = await getImage(params.id, params.imageId);
  if (!image) {
    return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
  }

  const file = await readProjectFile(params.id, image.filePath);
  return new NextResponse(new Uint8Array(file), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" },
  });
}
