import { NextResponse } from "next/server";
import { z } from "zod";

import { splitClip } from "@/server/services/timeline.service";

const splitSchema = z.object({ atMs: z.number().int().min(0) });

export async function POST(
  request: Request,
  { params }: { params: { id: string; clipId: string } },
) {
  const body = splitSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const result = await splitClip(params.clipId, body.data.atMs);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "분할에 실패했습니다." },
      { status: 400 },
    );
  }
}
