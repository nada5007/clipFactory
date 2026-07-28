import type { ManagedEnvKey } from "@/server/services/env-config.service";

export type LlmProvider = "anthropic" | "openai" | "xai" | "google";

export type LlmModelOption = {
  id: string;
  provider: LlmProvider;
  label: string;
  description: string;
};

export const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  anthropic: "Anthropic · Claude",
  openai: "OpenAI · GPT",
  xai: "xAI · Grok",
  google: "Google · Gemini",
};

// 각 프로바이더가 실제로 호출 가능한지는 이 키의 등록 여부로 판단한다.
// OpenAI는 이미지 생성(IMAGE_API_KEY)과 같은 계정 키를 재사용한다.
export const LLM_PROVIDER_ENV_KEY: Record<LlmProvider, ManagedEnvKey> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "IMAGE_API_KEY",
  xai: "XAI_API_KEY",
  google: "GEMINI_API_KEY",
};

export const LLM_MODEL_OPTIONS: LlmModelOption[] = [
  {
    id: "claude-opus-4-8",
    provider: "anthropic",
    label: "클로드 오퍼스 4.8",
    description: "최상위 모델 - 복잡한 콘셉트와 프리미엄 대본에 최적",
  },
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "클로드 소넷 5",
    description: "속도와 품질 균형, 기본값으로 권장",
  },
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "클로드 하이쿠 4.5",
    description: "초고속·저비용 - 빠른 초안과 반복 작업에 적합",
  },
  {
    id: "gpt-4o",
    provider: "openai",
    label: "GPT-4o",
    description: "균형형 모델 - 다양한 대본 스타일에 적합",
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    label: "GPT-4o mini",
    description: "가성비 모델 - 빠른 초안 및 반복 작업에 최적",
  },
  {
    id: "grok-2-latest",
    provider: "xai",
    label: "Grok 2",
    description: "xAI 최신 안정 모델 - 개성 있는 톤의 대본에 적합",
  },
  {
    id: "gemini-1.5-pro",
    provider: "google",
    label: "Gemini 1.5 Pro",
    description: "긴 컨텍스트·사실 기반 대본에 강점",
  },
  {
    id: "gemini-1.5-flash",
    provider: "google",
    label: "Gemini 1.5 Flash",
    description: "3배 빠른 응답, 대량 초안 생성에 최적",
  },
];

export const DEFAULT_LLM_MODEL_ID = "claude-sonnet-5";

export function getLlmModelOption(id: string): LlmModelOption {
  const found = LLM_MODEL_OPTIONS.find((option) => option.id === id);
  if (!found) {
    throw new Error(`알 수 없는 LLM 모델입니다: ${id}`);
  }
  return found;
}
