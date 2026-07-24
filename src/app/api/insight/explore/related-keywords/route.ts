import { NextResponse } from "next/server";

import { suggestRelatedKeywords } from "@/server/services/explore.service";

// UI_SPEC.md §7.1 "탐색·분석" 분석 모드 "추천 키워드" 버튼.
export async function GET(request: Request) {
  const keyword = new URL(request.url).searchParams.get("keyword")?.trim();
  if (!keyword) {
    return NextResponse.json({ error: "키워드를 입력하세요." }, { status: 400 });
  }

  try {
    const keywords = await suggestRelatedKeywords(keyword);
    return NextResponse.json({ keywords });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "연관 키워드를 생성하지 못했습니다." },
      { status: 502 },
    );
  }
}
