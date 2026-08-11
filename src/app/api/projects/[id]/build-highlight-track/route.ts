import { NextResponse } from "next/server";

import { buildHighlightVideoTrack } from "@/server/services/highlight.service";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await buildHighlightVideoTrack(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "하이라이트 영상 트랙 생성에 실패했습니다." },
      { status: 502 },
    );
  }
}
