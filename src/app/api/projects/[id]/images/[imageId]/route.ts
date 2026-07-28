import { NextResponse } from "next/server";

import { deleteImage } from "@/server/services/image.service";

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; imageId: string } },
) {
  try {
    await deleteImage(params.id, params.imageId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제에 실패했습니다." },
      { status: 400 },
    );
  }
}
