import { NextResponse } from "next/server";

import { analyzeKeywordMarketability, analyzeKeywordsBulk } from "@/server/services/explore.service";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const region = params.get("region") ?? undefined;
  const keywordsParam = params.get("keywords");

  if (keywordsParam) {
    const keywords = keywordsParam.split(",").map((k) => k.trim()).filter(Boolean);
    if (keywords.length === 0) {
      return NextResponse.json({ error: "키워드를 입력하세요." }, { status: 400 });
    }
    try {
      const result = await analyzeKeywordsBulk(keywords, region);
      return NextResponse.json({ results: result });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "키워드 시장성을 분석하지 못했습니다." },
        { status: 502 },
      );
    }
  }

  const keyword = params.get("keyword")?.trim();
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
