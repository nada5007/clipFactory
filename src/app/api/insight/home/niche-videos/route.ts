import { NextResponse } from "next/server";

import { getNichePopularVideos } from "@/server/services/explore.service";

export async function GET(request: Request) {
  const niche = new URL(request.url).searchParams.get("niche")?.trim();
  if (!niche) {
    return NextResponse.json({ error: "니치를 지정하세요." }, { status: 400 });
  }

  try {
    const videos = await getNichePopularVideos(niche);
    return NextResponse.json({ videos });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "니치 인기 영상을 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
