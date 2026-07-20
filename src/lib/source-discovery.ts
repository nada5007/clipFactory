// UI_SPEC.md §7.1 "소스 발굴": "한국 콘텐츠 제외"(기본 ON) — 한글 비중이 높은 제목/채널명은 한국 콘텐츠로 간주해 배제한다.
const HANGUL_PATTERN = /[가-힣]/g;

export function looksKorean(text: string): boolean {
  const stripped = text.replace(/\s+/g, "");
  if (stripped.length === 0) return false;
  const hangulCount = (text.match(HANGUL_PATTERN) ?? []).length;
  return hangulCount / stripped.length >= 0.3;
}

export type SourceCandidate = { title: string; channelTitle: string };

export function filterKoreanContent<T extends SourceCandidate>(items: T[], excludeKorean: boolean): T[] {
  if (!excludeKorean) return items;
  return items.filter((item) => !looksKorean(item.title) && !looksKorean(item.channelTitle));
}
