import { NextResponse } from "next/server";
import { z } from "zod";

import { IMAGE_TRANSFORM_RATIOS, IMAGE_TRANSFORM_RESOLUTIONS } from "@/lib/image-models";
import { previewImageTransform } from "@/server/services/image.service";

const transformFieldsSchema = z.object({
  existingImageIds: z.array(z.string()),
  prompt: z.string().min(1),
  modelKey: z.string().min(1),
  ratio: z.enum(IMAGE_TRANSFORM_RATIOS),
  resolution: z.enum(IMAGE_TRANSFORM_RESOLUTIONS),
  strength: z.coerce.number().min(0).max(100),
});

// 소스 이미지가 "프로젝트 기존 이미지"와 "로컬 드라이브 업로드"를 섞어 최대 5개까지 올 수 있어
// multipart/form-data로 받는다 (existingImageIds는 반복 필드, files는 실제 업로드 파일).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const form = await request.formData();

  const fields = transformFieldsSchema.safeParse({
    existingImageIds: form.getAll("existingImageIds").map(String),
    prompt: form.get("prompt"),
    modelKey: form.get("modelKey"),
    ratio: form.get("ratio"),
    resolution: form.get("resolution"),
    strength: form.get("strength"),
  });
  if (!fields.success) {
    return NextResponse.json({ error: fields.error.flatten() }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (fields.data.existingImageIds.length + files.length === 0) {
    return NextResponse.json({ error: "변환할 소스 이미지가 없습니다." }, { status: 400 });
  }
  if (fields.data.existingImageIds.length + files.length > 5) {
    return NextResponse.json({ error: "소스 이미지는 최대 5개까지 가능합니다." }, { status: 400 });
  }

  try {
    const uploadedImages = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
    const imageBase64 = await previewImageTransform(params.id, {
      existingImageIds: fields.data.existingImageIds,
      uploadedImages,
      prompt: fields.data.prompt,
      modelKey: fields.data.modelKey,
      ratio: fields.data.ratio,
      resolution: fields.data.resolution,
      strength: fields.data.strength,
    });
    return NextResponse.json({ imageBase64 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "이미지 변환에 실패했습니다." },
      { status: 502 },
    );
  }
}
