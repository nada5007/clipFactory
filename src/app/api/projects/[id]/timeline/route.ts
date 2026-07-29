import { NextResponse } from "next/server";

import { getOrSyncTimeline } from "@/server/services/timeline.service";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const timeline = await getOrSyncTimeline(params.id);
    return NextResponse.json(timeline);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "타임라인을 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
