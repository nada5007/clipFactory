import { NextResponse } from "next/server";

import { getPopularVideos } from "@/server/services/explore.service";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const region = params.get("region") ?? undefined;
  const category = params.get("category") ?? undefined;

  try {
    const result = await getPopularVideos(region, category);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "인기 영상을 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
