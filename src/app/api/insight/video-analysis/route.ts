import { NextResponse } from "next/server";

import { getVideoAnalysisDetail } from "@/server/services/video-analysis.service";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const url = params.get("url")?.trim();

  if (!url) {
    return NextResponse.json({ error: "YouTube 영상 URL 또는 ID를 입력하세요." }, { status: 400 });
  }

  try {
    const result = await getVideoAnalysisDetail(url);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "영상을 분석하지 못했습니다." },
      { status: 502 },
    );
  }
}
