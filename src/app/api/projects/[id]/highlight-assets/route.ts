import { NextResponse } from "next/server";

import { generateHighlightAssets } from "@/server/services/highlight.service";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const result = await generateHighlightAssets(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "대본·자막 생성에 실패했습니다." },
      { status: 502 },
    );
  }
}
