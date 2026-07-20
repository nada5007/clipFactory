import { NextResponse } from "next/server";
import { z } from "zod";

import { getUploadConfig, saveUploadConfig, uploadToYoutube } from "@/server/services/upload.service";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const config = await getUploadConfig(params.id);
  return NextResponse.json(config);
}

const saveUploadConfigSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  privacyStatus: z.enum(["PUBLIC", "UNLISTED", "PRIVATE"]).optional(),
  scheduledPublishAt: z.string().datetime().nullable().optional(),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = saveUploadConfigSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const config = await saveUploadConfig(params.id, {
      ...body.data,
      scheduledPublishAt:
        body.data.scheduledPublishAt === undefined ? undefined : body.data.scheduledPublishAt ? new Date(body.data.scheduledPublishAt) : null,
    });
    return NextResponse.json(config);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "업로드 설정을 저장하지 못했습니다." },
      { status: 400 },
    );
  }
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const config = await uploadToYoutube(params.id);
    return NextResponse.json(config, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "YouTube 업로드에 실패했습니다." },
      { status: 502 },
    );
  }
}
