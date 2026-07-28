import { env } from "@/env";
import type { ElevenLabsVoiceSettings } from "@/lib/voice-models";

// ElevenLabs. PROJECT_SPEC.md §0.2에 명시된 ELEVENLABS_API_KEY 기준.
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
  options?: { voiceId?: string; modelId?: string; settings?: ElevenLabsVoiceSettings },
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
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: options?.settings
        ? {
            stability: options.settings.stability,
            similarity_boost: options.settings.similarityBoost,
            style: options.settings.style,
            speed: options.settings.speed,
          }
        : undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs TTS 요청 실패: ${res.status} ${body}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

export type ElevenLabsModelOption = { id: string; label: string };
export type ElevenLabsVoiceOption = { id: string; label: string; gender?: string; accent?: string };

// 계정마다 사용 가능한 모델/보이스 라이브러리가 달라서 하드코딩하지 않고 매번 실제 API에서 가져온다.
export async function listElevenLabsModels(): Promise<ElevenLabsModelOption[]> {
  const apiKey = requireApiKey();
  const res = await fetch("https://api.elevenlabs.io/v1/models", {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs 모델 목록 조회 실패: ${res.status}`);
  }
  const data = (await res.json()) as { model_id: string; name: string; can_do_text_to_speech?: boolean }[];
  return data
    .filter((m) => m.can_do_text_to_speech)
    .map((m) => ({ id: m.model_id, label: m.name }));
}

export async function listElevenLabsVoices(): Promise<ElevenLabsVoiceOption[]> {
  const apiKey = requireApiKey();
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs 보이스 목록 조회 실패: ${res.status}`);
  }
  const data = (await res.json()) as {
    voices: { voice_id: string; name: string; labels?: { gender?: string; accent?: string } }[];
  };
  return data.voices.map((v) => ({
    id: v.voice_id,
    label: v.name,
    gender: v.labels?.gender,
    accent: v.labels?.accent,
  }));
}
