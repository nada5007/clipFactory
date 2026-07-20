import { NextResponse } from "next/server";

import { disconnectChannel } from "@/server/services/channel-oauth.service";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const channel = await disconnectChannel(params.id);
  return NextResponse.json(channel);
}
