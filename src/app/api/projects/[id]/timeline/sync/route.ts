import { NextResponse } from "next/server";

import { syncTimeline } from "@/server/services/timeline.service";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const timeline = await syncTimeline(params.id);
    return NextResponse.json(timeline);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "동기화에 실패했습니다." },
      { status: 502 },
    );
  }
}
