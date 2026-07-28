import { NextResponse } from "next/server";

import { getEffectiveBgmSettings } from "@/server/services/bgm.service";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const effective = await getEffectiveBgmSettings(params.id);
  return NextResponse.json(effective);
}
