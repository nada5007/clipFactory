import { NextResponse } from "next/server";

import { translateTitles } from "@/lib/clients/anthropic";

// UI_SPEC.md §7.1 "영상 카드 공통 버튼 4종" "[번역]": 카드 단위로 제목을 한글로 변환한다.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const titles = Array.isArray(body?.titles) ? body.titles.filter((t: unknown): t is string => typeof t === "string") : [];

  if (titles.length === 0) {
    return NextResponse.json({ error: "titles 배열이 필요합니다." }, { status: 400 });
  }

  try {
    const translations = await translateTitles(titles);
    return NextResponse.json({ translations });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "번역하지 못했습니다." },
      { status: 502 },
    );
  }
}
