import { NextResponse } from "next/server";

import { duplicateClip } from "@/server/services/timeline.service";

export async function POST(_request: Request, { params }: { params: { id: string; clipId: string } }) {
  try {
    const clip = await duplicateClip(params.clipId);
    return NextResponse.json(clip, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "복제에 실패했습니다." },
      { status: 400 },
    );
  }
}
