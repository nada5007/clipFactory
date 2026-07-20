import { NextResponse } from "next/server";
import { z } from "zod";

import { getEnvKeyStatuses, updateEnvKey } from "@/server/services/env-config.service";

export async function GET() {
  const statuses = await getEnvKeyStatuses();
  return NextResponse.json(statuses);
}

const updateSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export async function PATCH(request: Request) {
  const body = updateSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const status = await updateEnvKey(body.data.key, body.data.value);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "저장하지 못했습니다." },
      { status: 400 },
    );
  }
}
