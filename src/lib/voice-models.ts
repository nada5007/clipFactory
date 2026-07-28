import type { ManagedEnvKey } from "@/server/services/env-config.service";

export type TtsProvider = "openai" | "elevenlabs";

export const TTS_PROVIDER_ENV_KEY: Record<TtsProvider, ManagedEnvKey> = {
  openai: "IMAGE_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
};

export const TTS_PROVIDER_LABELS: Record<TtsProvider, string> = {
  openai: "OpenAI Audio TTS",
  elevenlabs: "ElevenLabs",
};

// OpenAI TTS 모델 — tts-1/tts-1-hd는 숫자 speed(0.25~4.0)를 지원하지만,
// gpt-4o-mini-tts는 숫자 speed 대신 자연어 음성 지시문(instructions)만 지원한다.
export type OpenAiTtsModel = "gpt-4o-mini-tts" | "tts-1" | "tts-1-hd";

export const OPENAI_TTS_MODELS: { id: OpenAiTtsModel; label: string; supportsSpeed: boolean; supportsInstructions: boolean }[] = [
  { id: "gpt-4o-mini-tts", label: "GPT-4o Mini TTS (Latest)", supportsSpeed: false, supportsInstructions: true },
  { id: "tts-1", label: "TTS-1", supportsSpeed: true, supportsInstructions: false },
  { id: "tts-1-hd", label: "TTS-1 HD", supportsSpeed: true, supportsInstructions: false },
];

export const DEFAULT_OPENAI_TTS_MODEL: OpenAiTtsModel = "gpt-4o-mini-tts";

// OpenAI 문서화된 음성 목록. 최근 추가된 marin/cedar는 참조 사이트에서 확인했으나
// 계정 결제 한도 문제로 실시간 검증은 하지 못했다 — 호출 시 오류가 나면 조정이 필요할 수 있다.
export const OPENAI_TTS_VOICES: { id: string; label: string }[] = [
  { id: "alloy", label: "Alloy (중성)" },
  { id: "ash", label: "Ash (남성)" },
  { id: "ballad", label: "Ballad (남성)" },
  { id: "coral", label: "Coral (여성)" },
  { id: "echo", label: "Echo (남성)" },
  { id: "fable", label: "Fable (남성)" },
  { id: "onyx", label: "Onyx (남성)" },
  { id: "nova", label: "Nova (여성)" },
  { id: "sage", label: "Sage (여성)" },
  { id: "shimmer", label: "Shimmer (여성)" },
  { id: "verse", label: "Verse (남성)" },
  { id: "marin", label: "Marin (여성)" },
  { id: "cedar", label: "Cedar (남성)" },
];

export const DEFAULT_OPENAI_TTS_VOICE = "alloy";

export const OPENAI_TTS_FORMATS = ["mp3", "wav", "ogg"] as const;
export type OpenAiTtsFormat = (typeof OPENAI_TTS_FORMATS)[number];

export type ElevenLabsVoiceSettings = {
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
};

export const DEFAULT_ELEVENLABS_SETTINGS: ElevenLabsVoiceSettings = {
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0,
  speed: 1.0,
};
