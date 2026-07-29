import { NextResponse } from "next/server";
import { z } from "zod";

import { removeGapsBetweenClips } from "@/server/services/timeline.service";

const schema = z.object({ ids: z.array(z.string().min(1)).min(1) });

// 멀티 셀렉트 "선택 클립 사이 갭만 제거".
export async function POST(request: Request) {
  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    await removeGapsBetweenClips(body.data.ids);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "갭 제거에 실패했습니다." },
      { status: 400 },
    );
  }
}
