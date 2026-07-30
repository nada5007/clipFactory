import { NextResponse } from "next/server";

import { readProjectFile } from "@/lib/storage";
import { getUploadedMedia } from "@/server/services/media.service";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

function resolveContentType(filePath: string): string {
  const ext = filePath.split(".").pop() ?? "";
  return CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream";
}

export async function GET(_request: Request, { params }: { params: { id: string; mediaId: string } }) {
  try {
    const media = await getUploadedMedia(params.mediaId);
    const buffer = await readProjectFile(params.id, media.filePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": resolveContentType(media.filePath),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }
}
