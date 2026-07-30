import { NextResponse } from "next/server";
import { z } from "zod";

import { applyAudioOptionsToTrack } from "@/server/services/timeline.service";

const audioOptionsSchema = z
  .object({ volume: z.number().min(0).max(2), muted: z.boolean(), speed: z.number().min(0.25).max(4) })
  .partial();

// "모든 TTS/BGM에 설정 적용" 체크박스: 해당 트랙(TTS 또는 BGM) 전체 클립에 동일 오디오 옵션을 적용한다.
export async function POST(request: Request, { params }: { params: { id: string; trackId: string } }) {
  const body = audioOptionsSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const timeline = await applyAudioOptionsToTrack(params.id, params.trackId, body.data);
    return NextResponse.json(timeline);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "적용에 실패했습니다." },
      { status: 400 },
    );
  }
}
