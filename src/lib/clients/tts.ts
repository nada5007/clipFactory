import { env } from "@/env";

// ElevenLabs 하나만 연결한다 (PROJECT_SPEC.md §0.2에 명시된 ELEVENLABS_API_KEY 기준).
// UI_SPEC의 7개 프로바이더(Google/OpenAI/NAVER/ElevenLabs/Fish/Supertone/Qwen3)는
// 채널 설정 TTS 탭을 구현할 때 어댑터로 확장한다.
export const TTS_PROVIDER = "elevenlabs";
export const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs 기본 제공 음성(Rachel)
export const DEFAULT_MODEL_ID = "eleven_multilingual_v2"; // 한국어 지원

function requireApiKey(): string {
  if (!env.ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY가 설정되지 않았습니다. .env를 확인하세요.");
  }
  return env.ELEVENLABS_API_KEY;
}

export async function synthesizeSpeech(
  text: string,
  options?: { voiceId?: string; modelId?: string },
): Promise<Buffer> {
  const apiKey = requireApiKey();
  const voiceId = options?.voiceId ?? DEFAULT_VOICE_ID;
  const modelId = options?.modelId ?? DEFAULT_MODEL_ID;

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, model_id: modelId }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs TTS 요청 실패: ${res.status} ${body}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
