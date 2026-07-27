import { NextResponse } from "next/server";

import { analyzeSurgePatternsForVideos } from "@/server/services/surge.service";
import type { SurgedVideo } from "@/lib/surge-detection";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const videos = Array.isArray(body?.videos) ? (body.videos as SurgedVideo[]) : [];

  if (videos.length === 0) {
    return NextResponse.json({ error: "분석할 영상이 없습니다." }, { status: 400 });
  }

  try {
    const result = await analyzeSurgePatternsForVideos(videos);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "패턴을 분석하지 못했습니다." },
      { status: 502 },
    );
  }
}
