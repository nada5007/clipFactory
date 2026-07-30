import { NextResponse } from "next/server";

import { uploadMediaToTrack } from "@/server/services/media.service";

// "클립 추가 > 직접 업로드": 파일을 저장하고 atMs 위치에 타임라인 클립을 만든다.
export async function POST(request: Request, { params }: { params: { id: string; trackId: string } }) {
  const form = await request.formData();
  const file = form.get("file");
  const atMs = Number(form.get("atMs"));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "업로드할 파일이 없습니다." }, { status: 400 });
  }
  if (!Number.isFinite(atMs) || atMs < 0) {
    return NextResponse.json({ error: "삽입 위치(atMs)가 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const clip = await uploadMediaToTrack(params.id, params.trackId, atMs, {
      buffer,
      mimeType: file.type,
      name: file.name,
    });
    return NextResponse.json(clip, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "업로드에 실패했습니다." },
      { status: 400 },
    );
  }
}
