import { NextResponse } from "next/server";
import { z } from "zod";

import { applyStyleToAllSubtitles } from "@/server/services/timeline.service";

const styleSchema = z
  .object({
    fontFamily: z.string(),
    fontSizePx: z.number(),
    fontColor: z.string(),
    bold: z.boolean(),
    backgroundColor: z.string(),
    backgroundOpacity: z.number().min(0).max(1),
    positionXPx: z.number(),
    positionYPx: z.number(),
    borderWidthPx: z.number(),
    borderColor: z.string(),
    maxLineLength: z.number(),
  })
  .partial();

// "모든 자막에 스타일 적용" 체크박스: 프로젝트의 SUBTITLE 트랙 전체 클립에 동일 스타일을 병합한다.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = styleSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const timeline = await applyStyleToAllSubtitles(params.id, body.data);
    return NextResponse.json(timeline);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "적용에 실패했습니다." },
      { status: 400 },
    );
  }
}
