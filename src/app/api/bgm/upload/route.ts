import { NextResponse } from "next/server";

import { BGM_CATEGORIES } from "@/lib/bgm-category";
import { uploadBgmTrack } from "@/server/services/bgm.service";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  const category = String(form.get("category") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "업로드할 파일이 없습니다." }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "제목을 입력하세요." }, { status: 400 });
  }
  if (!BGM_CATEGORIES.includes(category as (typeof BGM_CATEGORIES)[number])) {
    return NextResponse.json({ error: "카테고리가 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const track = await uploadBgmTrack({ title, category, buffer });
    return NextResponse.json(track, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "등록에 실패했습니다." },
      { status: 400 },
    );
  }
}
