import { NextResponse } from "next/server";
import { z } from "zod";

import { getNarrationAudioMode, setNarrationAudioMode } from "@/server/services/highlight.service";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const mode = await getNarrationAudioMode(params.id);
  return NextResponse.json({ mode });
}

const bodySchema = z.object({ mode: z.enum(["source", "duck", "replace"]) });

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const body = bodySchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const result = await setNarrationAudioMode(params.id, body.data.mode);
  return NextResponse.json(result);
}
