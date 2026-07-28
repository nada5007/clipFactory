import { NextResponse } from "next/server";
import { z } from "zod";

import { applyImageTransform } from "@/server/services/image.service";

const applySchema = z.object({ imageBase64: z.string().min(1) });

export async function POST(
  request: Request,
  { params }: { params: { id: string; imageId: string } },
) {
  const body = applySchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const image = await applyImageTransform(params.id, params.imageId, body.data.imageBase64);
    return NextResponse.json(image);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "적용에 실패했습니다." },
      { status: 400 },
    );
  }
}
