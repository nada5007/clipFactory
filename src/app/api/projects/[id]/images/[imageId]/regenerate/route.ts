import { NextResponse } from "next/server";
import { z } from "zod";

import { IMAGE_TRANSFORM_RESOLUTIONS } from "@/lib/image-models";
import { regenerateSingleImage } from "@/server/services/image.service";

const regenerateSchema = z.object({
  prompt: z.string().optional(),
  modelKey: z.string().min(1),
  resolution: z.enum(IMAGE_TRANSFORM_RESOLUTIONS).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string; imageId: string } },
) {
  const body = regenerateSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const image = await regenerateSingleImage(params.id, params.imageId, body.data);
    return NextResponse.json(image);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "재생성에 실패했습니다." },
      { status: 502 },
    );
  }
}
