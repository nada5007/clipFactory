import { NextResponse } from "next/server";

import { replaceImageFile } from "@/server/services/image.service";

export async function POST(
  request: Request,
  { params }: { params: { id: string; imageId: string } },
) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "업로드할 파일이 없습니다." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const image = await replaceImageFile(params.id, params.imageId, buffer);
    return NextResponse.json(image);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "업로드에 실패했습니다." },
      { status: 400 },
    );
  }
}
