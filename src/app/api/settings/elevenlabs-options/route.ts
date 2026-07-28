import { NextResponse } from "next/server";

import { listElevenLabsModels, listElevenLabsVoices } from "@/lib/clients/tts";

// ElevenLabs는 계정마다 사용 가능한 모델/보이스 라이브러리가 달라서 매 호출 시 실제 API에서 가져온다.
export async function GET() {
  try {
    const [models, voices] = await Promise.all([listElevenLabsModels(), listElevenLabsVoices()]);
    return NextResponse.json({ models, voices });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ElevenLabs 옵션 조회에 실패했습니다." },
      { status: 502 },
    );
  }
}
