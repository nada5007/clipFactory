import type { ManagedEnvKey } from "@/server/services/env-config.service";

export type ImageProvider = "openai" | "google";
export type ImageQuality = "low" | "medium" | "high";

export type ImageModelOption = {
  key: string;
  id: string;
  provider: ImageProvider;
  quality?: ImageQuality;
  label: string;
  description: string;
  // "이미지 변환"에서 한 번에 합성할 수 있는 소스 이미지 최대 개수. 없으면 개수 제한을 적용하지 않는다.
  maxInputImages?: number;
};

export const IMAGE_PROVIDER_ENV_KEY: Record<ImageProvider, ManagedEnvKey> = {
  openai: "IMAGE_API_KEY",
  google: "GEMINI_API_KEY",
};

// PROJECT_SPEC.md §1.3 "탭 바 도입 + 이미지 탭 전체 확장": OpenAI 품질 티어 3단계 + Nano Banana 2단계.
export const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
  {
    key: "openai-low",
    id: "gpt-image-1",
    provider: "openai",
    quality: "low",
    label: "오픈AI Low",
    description: "OpenAI 한글 텍스트 90%+ 정확도, 사진급 사실감, 가성비",
  },
  {
    key: "openai-medium",
    id: "gpt-image-1",
    provider: "openai",
    quality: "medium",
    label: "오픈AI Medium",
    description: "OpenAI 한글+디테일 균형, 배경 한글 표지판도 정확",
  },
  {
    key: "openai-high",
    id: "gpt-image-1",
    provider: "openai",
    quality: "high",
    label: "오픈AI High",
    description: "OpenAI DSLR급 인물 + 배경 한글 다수 정확 렌더링",
  },
  {
    key: "nanobanana-standard",
    id: "gemini-2.5-flash-image",
    provider: "google",
    label: "Nano Banana (표준형)",
    description: "Google Gemini 기반 고품질 이미지 생성 모델",
    maxInputImages: 3,
  },
  {
    key: "nanobanana-pro",
    id: "gemini-3-pro-image-preview",
    provider: "google",
    label: "Nano Banana Pro (고급형)",
    description: "Google Gemini Pro 기반 최고 품질 이미지 생성 모델",
    maxInputImages: 5,
  },
  {
    // Gemini API의 ListModels 응답으로 확인한 실제 ID (displayName: "Nano Banana 2").
    key: "nanobanana-2-fast",
    id: "gemini-3.1-flash-image",
    provider: "google",
    label: "Nano Banana 2 (고속형)",
    description: "나노바나나 프로의 빠른 버전 (Pro급 품질, 50% 저렴)",
    maxInputImages: 5,
  },
];

export const DEFAULT_IMAGE_MODEL_KEY = "openai-low";

export function getImageModelOption(key: string): ImageModelOption {
  const found = IMAGE_MODEL_OPTIONS.find((option) => option.key === key);
  if (!found) {
    throw new Error(`알 수 없는 이미지 모델입니다: ${key}`);
  }
  return found;
}

export type PresetLanguage = "ko" | "en";

// UI_SPEC.md 참조 캡처의 배경 프리셋 6종 — 변환 프롬프트 앞에 붙는 스타일 지시문. 한국어/English 토글 지원.
export const BACKGROUND_PRESETS: {
  key: string;
  label: Record<PresetLanguage, string>;
  promptFragment: Record<PresetLanguage, string>;
}[] = [
  {
    key: "studio",
    label: { ko: "고급 스튜디오", en: "Premium Studio" },
    promptFragment: { ko: "고급스러운 스튜디오 배경, 부드러운 조명", en: "premium studio background, soft studio lighting" },
  },
  {
    key: "minimal-white",
    label: { ko: "미니멀 화이트", en: "Minimal White" },
    promptFragment: { ko: "미니멀한 화이트 배경, 깔끔한 그림자", en: "minimal white background, clean soft shadow" },
  },
  {
    key: "nature",
    label: { ko: "자연 속", en: "In Nature" },
    promptFragment: { ko: "자연광이 비치는 야외 자연 배경", en: "outdoor natural background with natural sunlight" },
  },
  {
    key: "cafe",
    label: { ko: "카페 분위기", en: "Cafe Vibe" },
    promptFragment: { ko: "따뜻한 조명의 아늑한 카페 배경", en: "cozy cafe background with warm lighting" },
  },
  {
    key: "korean-home",
    label: { ko: "한국 거실", en: "Korean Living Room" },
    promptFragment: { ko: "한국식 거실 인테리어 배경", en: "Korean-style living room interior background" },
  },
  {
    key: "beach",
    label: { ko: "해변 배경", en: "Beach" },
    promptFragment: { ko: "밝은 햇살이 비치는 해변 배경", en: "bright sunny beach background" },
  },
];

// "이미지 전체 재생성" 모달의 스타일 프리셋 — 선택 시 각 장면 프롬프트 앞에 스타일 지시문을 덧붙인다.
// "직접 입력"은 promptFragment가 없어 프리셋을 적용하지 않는다(사용자가 프롬프트를 그대로 유지).
export const STYLE_PRESETS: { key: string; label: string; promptFragment: string | null }[] = [
  { key: "custom", label: "직접 입력 (프리셋 사용 안 함)", promptFragment: null },
  { key: "realistic-photo", label: "사실적 사진", promptFragment: "사실적인 사진 스타일, 자연스러운 조명" },
  {
    key: "realistic-no-text",
    label: "텍스트 없는 사실적 사진",
    promptFragment: "텍스트나 글자가 전혀 없는 사실적인 사진 스타일",
  },
  { key: "animation", label: "애니메이션", promptFragment: "애니메이션 스타일 일러스트" },
  { key: "ghibli", label: "지브리 스타일", promptFragment: "지브리 스튜디오풍 애니메이션 스타일" },
  { key: "van-gogh", label: "고흐 유화", promptFragment: "반 고흐 화풍의 유화 스타일" },
  { key: "watercolor", label: "수채화", promptFragment: "수채화 스타일" },
  { key: "ink-wash", label: "동양 수묵화", promptFragment: "동양 수묵화 스타일" },
  { key: "pixel-art", label: "픽셀 아트", promptFragment: "픽셀 아트 스타일" },
  { key: "cyberpunk", label: "사이버펑크", promptFragment: "사이버펑크 스타일" },
  { key: "fantasy-art", label: "판타지 아트", promptFragment: "판타지 아트 스타일" },
  { key: "vintage", label: "빈티지", promptFragment: "빈티지 필름 사진 스타일" },
];

export const DEFAULT_STYLE_PRESET_KEY = "realistic-photo";

export const IMAGE_TRANSFORM_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16"] as const;
export type ImageTransformRatio = (typeof IMAGE_TRANSFORM_RATIOS)[number];

export const IMAGE_TRANSFORM_RESOLUTIONS = ["1K", "2K", "4K"] as const;
export type ImageTransformResolution = (typeof IMAGE_TRANSFORM_RESOLUTIONS)[number];
