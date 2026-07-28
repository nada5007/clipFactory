import { NextResponse } from "next/server";

import { listBgmTracks } from "@/server/services/bgm.service";

export async function GET(request: Request) {
  const category = new URL(request.url).searchParams.get("category") ?? undefined;
  const tracks = await listBgmTracks(category);
  return NextResponse.json(tracks);
}
