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

// PROJECT_SPEC.md §2.3 "소스 발굴 (2.2) — 선택 언어 필터 강화": search.list의 regionCode/relevanceLanguage는
// 콘텐츠 언어를 하드 필터하지 못해, 영어권만 골라도 중국·일본(한자문화권) 결과가 섞인다. 제목의 "지배적
// 문자권"을 판정해, 선택한 언어의 문자권에 속하지 않는 영상을 제외한다.
export type Script = "latin" | "japanese" | "han" | "korean" | "cyrillic" | "thai" | "arabic" | "unknown";

// 언어 칩 코드 → 대표 문자권. 라틴 계열 언어끼리는 문자권이 같아 서로 구분하지 못한다(디스클로저).
const LANGUAGE_SCRIPT: Record<string, Script> = {
  en: "latin", es: "latin", de: "latin", fr: "latin", it: "latin", pt: "latin", pl: "latin", tr: "latin", id: "latin", vi: "latin",
  ja: "japanese",
  zh: "han",
  ru: "cyrillic",
  th: "thai",
  ar: "arabic",
};

const KANA = /[぀-ヿ]/; // 히라가나/가타카나 = 일본어 확정 시그널
// 비라틴 문자권을 라틴보다 먼저 본다. 제목의 "MULTI SUB", "FULL", "OST" 같은 라틴 메타데이터가 실제
// 콘텐츠 문자(한자 등)보다 많아도, 비라틴 문자가 존재하면 그 문자권을 콘텐츠 언어로 판정하기 위해서다.
const NON_LATIN_PATTERNS: { script: Exclude<Script, "japanese" | "latin" | "unknown">; pattern: RegExp }[] = [
  { script: "korean", pattern: /[가-힣]/ },
  { script: "han", pattern: /[一-鿿㐀-䶿]/ },
  { script: "cyrillic", pattern: /[Ѐ-ӿ]/ },
  { script: "thai", pattern: /[฀-๿]/ },
  { script: "arabic", pattern: /[؀-ۿ]/ },
];
const LATIN = /[a-zA-ZÀ-ɏḀ-ỿ]/;

export function detectDominantScript(text: string): Script {
  if (KANA.test(text)) return "japanese";
  for (const { script, pattern } of NON_LATIN_PATTERNS) {
    if (pattern.test(text)) return script;
  }
  if (LATIN.test(text)) return "latin";
  return "unknown";
}

// 선택한 언어들의 문자권에 속하는 영상만 남긴다. 언어를 하나도 안 골랐으면 필터하지 않는다(기존 동작).
// 문자권 판정이 불가한 제목(숫자/이모지만 있는 경우 등)은 과도한 제거를 막기 위해 유지한다.
export function filterByLanguageScripts<T extends SourceCandidate>(items: T[], languageCodes: string[]): T[] {
  if (languageCodes.length === 0) return items;
  const allowed = new Set(languageCodes.map((c) => LANGUAGE_SCRIPT[c]).filter(Boolean));
  if (allowed.size === 0) return items;
  return items.filter((item) => {
    const script = detectDominantScript(item.title);
    return script === "unknown" || allowed.has(script);
  });
}
