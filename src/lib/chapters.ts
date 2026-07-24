// UI_SPEC.md §7.1 "소스 영상 상세" "종합 분석" 탭: 설명란의 타임스탬프 패턴에서 챕터를 파싱한다.
// 최소 2개 이상의 타임스탬프 라인이 있어야 "챕터"로 인정한다 (1개는 우연한 시간 언급일 수 있음).

export type Chapter = { timestamp: string; label: string };

const CHAPTER_LINE_PATTERN = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/;
const MIN_CHAPTERS = 2;

export function parseChapters(description: string): Chapter[] {
  const chapters: Chapter[] = [];
  for (const line of description.split("\n")) {
    const match = line.trim().match(CHAPTER_LINE_PATTERN);
    if (match) {
      chapters.push({ timestamp: match[1], label: match[2].trim() });
    }
  }
  return chapters.length >= MIN_CHAPTERS ? chapters : [];
}
