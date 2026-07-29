import { NextResponse } from "next/server";

import { applySubtitleLineLengthFix } from "@/server/services/timeline.service";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await applySubtitleLineLengthFix(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정에 실패했습니다." },
      { status: 400 },
    );
  }
}
