import { generateRelatedKeywords } from "@/lib/clients/anthropic";

// UI_SPEC.md §7.1 "탐색·분석"/"떡상 영상" "자동 키워드 확장" 공통 로직: 입력 키워드 → 연관 검색어 최대 3개
// 자동 생성 → [원본, ...연관어] 반환. ANTHROPIC_API_KEY 미설정 등으로 실패해도 원본 키워드만으로 계속 진행한다
// (보조 기능이므로 연성 실패 허용).
export const AUTO_EXPAND_RELATED_COUNT = 3;

export async function expandKeywordTerms(keyword: string, count = AUTO_EXPAND_RELATED_COUNT): Promise<string[]> {
  try {
    const related = await generateRelatedKeywords(keyword, count);
    return Array.from(new Set([keyword, ...related]));
  } catch {
    return [keyword];
  }
}
