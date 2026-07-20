import { NextResponse } from "next/server";
import { z } from "zod";

import { createChannel, listChannels } from "@/server/services/channel.service";

export async function GET() {
  const channels = await listChannels();
  return NextResponse.json(channels);
}

const createChannelSchema = z.object({
  name: z.string().min(1),
  videoFormat: z.enum(["SHORT", "LONG"]).optional(),
});

export async function POST(request: Request) {
  const body = createChannelSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const channel = await createChannel(body.data);
  return NextResponse.json(channel, { status: 201 });
}
