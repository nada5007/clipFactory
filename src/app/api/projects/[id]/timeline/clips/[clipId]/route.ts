import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteClip, updateClipText, updateClipTiming } from "@/server/services/timeline.service";

const patchSchema = z.object({
  startMs: z.number().int().min(0).optional(),
  endMs: z.number().int().min(0).optional(),
  text: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; clipId: string } },
) {
  const body = patchSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  if (body.data.startMs === undefined && body.data.endMs === undefined && body.data.text === undefined) {
    return NextResponse.json({ error: "변경할 값이 없습니다." }, { status: 400 });
  }

  try {
    let clip;
    if (body.data.startMs !== undefined && body.data.endMs !== undefined) {
      clip = await updateClipTiming(params.clipId, { startMs: body.data.startMs, endMs: body.data.endMs });
    }
    if (body.data.text !== undefined) {
      clip = await updateClipText(params.clipId, body.data.text);
    }
    return NextResponse.json(clip);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정에 실패했습니다." },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; clipId: string } },
) {
  try {
    await deleteClip(params.clipId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제에 실패했습니다." },
      { status: 400 },
    );
  }
}
