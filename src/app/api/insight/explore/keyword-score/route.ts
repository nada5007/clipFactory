import { NextResponse } from "next/server";

import { analyzeKeywordMarketability } from "@/server/services/explore.service";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const keyword = params.get("keyword")?.trim();
  const region = params.get("region") ?? undefined;

  if (!keyword) {
    return NextResponse.json({ error: "키워드를 입력하세요." }, { status: 400 });
  }

  try {
    const result = await analyzeKeywordMarketability(keyword, region);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "키워드 시장성을 분석하지 못했습니다." },
      { status: 502 },
    );
  }
}
