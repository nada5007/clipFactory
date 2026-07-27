import { NextResponse } from "next/server";

import type { SurgePeriod } from "@/lib/surge-options";
import {
  findSurgedVideos,
  findSurgedVideosByCategory,
  findSurgedVideosForChannel,
} from "@/server/services/surge.service";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mode = params.get("mode") ?? "keyword";
  const region = params.get("region") ?? undefined;
  const category = params.get("category") ?? undefined;
  const videoForm = (params.get("videoForm") as "all" | "short" | "long" | null) ?? undefined;
  const period = (params.get("period") as SurgePeriod | null) ?? undefined;
  const thresholdParam = params.get("threshold");
  const threshold = thresholdParam ? Number(thresholdParam) : undefined;

  const hiddenGemEnabled = params.get("hiddenGem") === "true";
  const subscriberCapParam = params.get("subscriberCap");
  const hiddenGem = hiddenGemEnabled
    ? { enabled: true, subscriberCap: subscriberCapParam ? Number(subscriberCapParam) : 100_000 }
    : undefined;

  try {
    if (mode === "category") {
      const seedKeyword = params.get("seedKeyword")?.trim() || undefined;
      const result = await findSurgedVideosByCategory({
        regionCode: region,
        categoryId: category,
        seedKeyword,
        videoForm,
        period,
        threshold,
        hiddenGem,
      });
      return NextResponse.json(result);
    }

    if (mode === "channel") {
      const channelId = params.get("channelId")?.trim();
      if (!channelId) {
        return NextResponse.json({ error: "채널 ID를 입력하세요." }, { status: 400 });
      }
      const result = await findSurgedVideosForChannel({ channelId, videoForm, period, threshold });
      return NextResponse.json(result);
    }

    const keyword = params.get("keyword")?.trim();
    if (!keyword) {
      return NextResponse.json({ error: "키워드를 입력하세요." }, { status: 400 });
    }
    const result = await findSurgedVideos({
      keyword,
      regionCode: region,
      categoryId: category,
      videoForm,
      period,
      threshold,
      hiddenGem,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "떡상 영상을 찾지 못했습니다." },
      { status: 502 },
    );
  }
}
