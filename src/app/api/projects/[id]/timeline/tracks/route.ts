import { NextResponse } from "next/server";
import { z } from "zod";

import { addTrack } from "@/server/services/timeline.service";

const schema = z.object({
  type: z.enum(["SUBTITLE", "VIDEO", "IMAGE", "TTS", "AUDIO", "BGM", "SFX"]),
  name: z.string().optional(),
});

// "+ 트랙 추가": 사용자가 직접 만드는 트랙(autoSync=false)을 새로 만든다.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = schema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const track = await addTrack(params.id, body.data.type, body.data.name);
    return NextResponse.json(track, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "트랙 추가에 실패했습니다." },
      { status: 400 },
    );
  }
}
