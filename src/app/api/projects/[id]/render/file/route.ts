import { NextResponse } from "next/server";

import { readProjectFile } from "@/lib/storage";
import { getVideo } from "@/server/services/video.service";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const video = await getVideo(params.id);
  if (!video) {
    return NextResponse.json({ error: "렌더링된 영상이 없습니다." }, { status: 404 });
  }

  const file = await readProjectFile(params.id, video.filePath);
  return new NextResponse(new Uint8Array(file), {
    headers: { "Content-Type": "video/mp4", "Cache-Control": "private, max-age=3600" },
  });
}
