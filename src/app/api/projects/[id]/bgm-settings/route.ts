import { NextResponse } from "next/server";
import { z } from "zod";

import { getProjectBgmSettings, setProjectBgmSettings } from "@/server/services/bgm.service";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const settings = await getProjectBgmSettings(params.id);
  return NextResponse.json(settings);
}

const bgmSettingsSchema = z
  .object({
    trackId: z.string().min(1),
    volumeDb: z.number().min(-60).max(12),
    playbackSpeed: z.number().min(0.5).max(2),
    loop: z.boolean(),
  })
  .nullable();

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const body = bgmSettingsSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const project = await setProjectBgmSettings(params.id, body.data);
  return NextResponse.json(project);
}
