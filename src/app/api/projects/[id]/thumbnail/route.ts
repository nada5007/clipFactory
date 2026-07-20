import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteThumbnail, getThumbnail, saveThumbnail } from "@/server/services/thumbnail.service";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const thumbnail = await getThumbnail(params.id);
  return NextResponse.json(thumbnail);
}

const saveThumbnailSchema = z.object({
  imageDataUrl: z.string().startsWith("data:image/png;base64,"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = saveThumbnailSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const base64 = body.data.imageDataUrl.slice("data:image/png;base64,".length);
  const buffer = Buffer.from(base64, "base64");

  const thumbnail = await saveThumbnail(params.id, buffer, { width: body.data.width, height: body.data.height });
  return NextResponse.json(thumbnail, { status: 201 });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  await deleteThumbnail(params.id);
  return new NextResponse(null, { status: 204 });
}
