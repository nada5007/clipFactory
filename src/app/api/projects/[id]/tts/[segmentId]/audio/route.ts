import { NextResponse } from "next/server";

import { readProjectFile } from "@/lib/storage";
import { getAudioSegment } from "@/server/services/tts.service";

function resolveAudioContentType(filePath: string): string {
  if (filePath.endsWith(".wav")) return "audio/wav";
  if (filePath.endsWith(".ogg")) return "audio/ogg";
  return "audio/mpeg";
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string; segmentId: string } },
) {
  const segment = await getAudioSegment(params.id, params.segmentId);
  if (!segment) {
    return NextResponse.json({ error: "세그먼트를 찾을 수 없습니다." }, { status: 404 });
  }

  const audio = await readProjectFile(params.id, segment.filePath);
  return new NextResponse(new Uint8Array(audio), {
    headers: {
      "Content-Type": resolveAudioContentType(segment.filePath),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
