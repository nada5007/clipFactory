import { NextResponse } from "next/server";
import { z } from "zod";

import { createOrRegenerateScript, getScript, updateScript } from "@/server/services/script.service";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const script = await getScript(params.id);
  if (!script) {
    return NextResponse.json({ error: "스크립트가 없습니다." }, { status: 404 });
  }
  return NextResponse.json(script);
}

const generateScriptSchema = z.object({
  topic: z.string().min(100).max(2000),
  durationSeconds: z.number().int().min(30).max(90),
  imagePromptCount: z.number().int().min(1).max(30),
  includeChannelPrompt: z.boolean(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = generateScriptSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const script = await createOrRegenerateScript(params.id, body.data);
    return NextResponse.json(script, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "스크립트 생성에 실패했습니다." },
      { status: 502 },
    );
  }
}

const updateScriptSchema = z.object({
  title: z.string().min(1).optional(),
  hook: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  imagePrompts: z.array(z.string()).optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = updateScriptSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const script = await updateScript(params.id, body.data);
  return NextResponse.json(script);
}
