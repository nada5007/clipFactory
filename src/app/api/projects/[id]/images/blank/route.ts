import { NextResponse } from "next/server";

import { addBlankImage } from "@/server/services/image.service";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const image = await addBlankImage(params.id);
  return NextResponse.json(image, { status: 201 });
}
