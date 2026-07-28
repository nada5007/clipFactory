import { NextResponse } from "next/server";
import { z } from "zod";

import { regenerateScriptField } from "@/server/services/script.service";

const regenerateFieldSchema = z.object({
  field: z.enum(["title", "hook", "body", "imagePrompts"]),
  customPrompt: z.string().max(1000).optional(),
  modelId: z.string().min(1),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = regenerateFieldSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const script = await regenerateScriptField(params.id, body.data);
    return NextResponse.json(script);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "재생성에 실패했습니다." },
      { status: 502 },
    );
  }
}
