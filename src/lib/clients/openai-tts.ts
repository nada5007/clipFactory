import { env } from "@/env";
import type { OpenAiTtsFormat, OpenAiTtsModel } from "@/lib/voice-models";

// 이미지 생성(gpt-image-1)/스크립트 재생성(GPT)과 같은 OpenAI 계정 키(IMAGE_API_KEY)를 재사용한다.
function requireApiKey(): string {
  if (!env.IMAGE_API_KEY) {
    throw new Error("OpenAI API 키가 설정되지 않았습니다. 채널 설정 > API 키 관리에서 등록하세요.");
  }
  return env.IMAGE_API_KEY;
}

export type OpenAiTtsInput = {
  text: string;
  voice: string;
  model: OpenAiTtsModel;
  format: OpenAiTtsFormat;
  instructions?: string;
  speed?: number;
};

// PROJECT_SPEC.md §1.3 "TTS 탭 전체 확장": OpenAI Audio TTS(/v1/audio/speech).
// gpt-4o-mini-tts는 instructions만, tts-1/tts-1-hd는 숫자 speed만 지원한다.
export async function synthesizeSpeechWithOpenAi(input: OpenAiTtsInput): Promise<Buffer> {
  const apiKey = requireApiKey();

  const body: Record<string, unknown> = {
    model: input.model,
    voice: input.voice,
    input: input.text,
    response_format: input.format,
  };
  if (input.model === "gpt-4o-mini-tts" && input.instructions) {
    body.instructions = input.instructions;
  }
  if (input.model !== "gpt-4o-mini-tts" && input.speed) {
    body.speed = input.speed;
  }

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI TTS 요청 실패: ${res.status} ${text}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
