import { NextResponse } from "next/server";

import { findSurgedVideos } from "@/server/services/surge.service";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const keyword = params.get("keyword")?.trim();
  const region = params.get("region") ?? undefined;
  const days = params.get("days");
  const thresholdParam = params.get("threshold");

  if (!keyword) {
    return NextResponse.json({ error: "키워드를 입력하세요." }, { status: 400 });
  }

  const threshold = thresholdParam ? Number(thresholdParam) : undefined;
  const publishedAfter = days
    ? new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString()
    : undefined;

  try {
    const result = await findSurgedVideos({ keyword, regionCode: region, publishedAfter, threshold });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "떡상 영상을 찾지 못했습니다." },
      { status: 502 },
    );
  }
}
