import { NextResponse } from "next/server";

import { generateHighlightThumbnailFrame } from "@/server/services/highlight.service";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await generateHighlightThumbnailFrame(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "썸네일 프레임 생성에 실패했습니다." },
      { status: 502 },
    );
  }
}
