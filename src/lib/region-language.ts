// PROJECT_SPEC.md §2.3 "탐색·분석 (2.4) — 국가 선택 실제 반영": 국가 코드를 YouTube search.list의
// relevanceLanguage(ISO-639-1)와 검색어 번역용 언어 한국어 라벨로 매핑한다. regionCode만으로는 "그 나라
// 유튜브 검색"이 되지 않으므로(검색 관련도는 검색어 언어가 지배), 국가별 언어 힌트를 함께 준다.
export type RegionLanguage = { relevanceLanguage: string; languageLabel: string };

const REGION_LANGUAGE: Record<string, RegionLanguage> = {
  KR: { relevanceLanguage: "ko", languageLabel: "한국어" },
  US: { relevanceLanguage: "en", languageLabel: "영어" },
  JP: { relevanceLanguage: "ja", languageLabel: "일본어" },
  GB: { relevanceLanguage: "en", languageLabel: "영어" },
  DE: { relevanceLanguage: "de", languageLabel: "독일어" },
  FR: { relevanceLanguage: "fr", languageLabel: "프랑스어" },
  IN: { relevanceLanguage: "hi", languageLabel: "힌디어" },
  BR: { relevanceLanguage: "pt", languageLabel: "포르투갈어" },
  MX: { relevanceLanguage: "es", languageLabel: "스페인어" },
  VN: { relevanceLanguage: "vi", languageLabel: "베트남어" },
  ID: { relevanceLanguage: "id", languageLabel: "인도네시아어" },
  TH: { relevanceLanguage: "th", languageLabel: "태국어" },
  TW: { relevanceLanguage: "zh", languageLabel: "중국어(번체)" },
  ES: { relevanceLanguage: "es", languageLabel: "스페인어" },
  RU: { relevanceLanguage: "ru", languageLabel: "러시아어" },
};

export function resolveRegionLanguage(regionCode: string | undefined): RegionLanguage | undefined {
  if (!regionCode) return undefined;
  return REGION_LANGUAGE[regionCode.toUpperCase()];
}

// 검색어를 번역해서 검색하는 게 의미 있는 경우(선택 국가가 KR이 아니고 매핑이 있는 경우)의 대상 언어 라벨.
export function resolveTranslateTargetLabel(regionCode: string | undefined): string | undefined {
  if (!regionCode || regionCode.toUpperCase() === "KR") return undefined;
  return REGION_LANGUAGE[regionCode.toUpperCase()]?.languageLabel;
}
