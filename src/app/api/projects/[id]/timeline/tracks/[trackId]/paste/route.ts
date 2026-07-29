import { NextResponse } from "next/server";
import { z } from "zod";

import { pasteClips } from "@/server/services/timeline.service";

const itemSchema = z.object({
  payload: z.object({ label: z.string() }).catchall(z.unknown()),
  durationMs: z.number().int().min(1),
});

const pasteSchema = z.object({
  atMs: z.number().int().min(0),
  items: z.array(itemSchema).min(1),
});

// 붙여넣기(Ctrl+V)/복사한 클립을 재생헤드 위치에 삽입.
export async function POST(request: Request, { params }: { params: { id: string; trackId: string } }) {
  const body = pasteSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const created = await pasteClips(params.trackId, body.data.atMs, body.data.items);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "붙여넣기에 실패했습니다." },
      { status: 400 },
    );
  }
}
