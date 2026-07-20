import { NextResponse } from "next/server";

import { generateAudioSegments, listAudioSegments } from "@/server/services/tts.service";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const segments = await listAudioSegments(params.id);
  return NextResponse.json(segments);
}

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const segments = await generateAudioSegments(params.id);
    return NextResponse.json(segments, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TTS 생성에 실패했습니다." },
      { status: 502 },
    );
  }
}
