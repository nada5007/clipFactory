import { NextResponse } from "next/server";

import { getChannelSections } from "@/server/services/channel-analysis.service";

export async function GET(request: Request) {
  const channelId = new URL(request.url).searchParams.get("channelId")?.trim();

  if (!channelId) {
    return NextResponse.json({ error: "채널 ID가 필요합니다." }, { status: 400 });
  }

  try {
    const result = await getChannelSections(channelId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "채널 카테고리를 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
