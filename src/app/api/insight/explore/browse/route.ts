import { NextResponse } from "next/server";

import type { PerformanceTier } from "@/lib/explore-options";
import { browseVideos, type BrowseVideosInput } from "@/server/services/explore.service";

const VALID_TIERS: PerformanceTier[] = ["explosive", "rising", "steady_growth", "evergreen", "stagnant"];

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const tiersParam = params.get("tiers");
  const performanceTiers = tiersParam
    ? tiersParam.split(",").filter((t): t is PerformanceTier => VALID_TIERS.includes(t as PerformanceTier))
    : undefined;

  const input: BrowseVideosInput = {
    regionCode: params.get("region") ?? undefined,
    categoryId: params.get("category") ?? undefined,
    period: (params.get("period") as BrowseVideosInput["period"]) ?? undefined,
    query: params.get("query") ?? undefined,
    niche: params.get("niche") ?? undefined,
    videoForm: (params.get("videoForm") as BrowseVideosInput["videoForm"]) ?? undefined,
    performanceTiers,
    minViewFilter: (params.get("minView") as BrowseVideosInput["minViewFilter"]) ?? undefined,
    channelUniqueOnly: params.get("channelUniqueOnly") === "true",
    krOnly: params.get("krOnly") === null ? undefined : params.get("krOnly") !== "false",
    translateQuery: params.get("translateQuery") === "true",
  };

  try {
    const result = await browseVideos(input);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "영상을 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
