import { NextResponse } from "next/server";

import { removeTrackGaps } from "@/server/services/timeline.service";

// "전체 갭 제거": 트랙의 모든 클립을 빈틈없이 당겨 붙인다.
export async function POST(_request: Request, { params }: { params: { id: string; trackId: string } }) {
  try {
    await removeTrackGaps(params.trackId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "갭 제거에 실패했습니다." },
      { status: 400 },
    );
  }
}
