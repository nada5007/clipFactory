// AnimalShortform 프로젝트의 CATEGORY_KEYWORDS를 그대로 포팅했다 — 제목 키워드로 카테고리를 추론한다.
export const BGM_CATEGORIES = ["귀여운", "웅장한", "신나는", "잔잔한", "긴장감", "기타"] as const;
export type BgmCategory = (typeof BGM_CATEGORIES)[number];

const CATEGORY_KEYWORDS: Record<Exclude<BgmCategory, "기타">, string[]> = {
  귀여운: ["cute", "귀여운", "동화", "fluffy", "kawaii"],
  웅장한: ["epic", "웅장", "dramatic", "cinematic", "grand"],
  신나는: ["bright", "happy", "upbeat", "신나는", "exciting", "fun", "joy"],
  잔잔한: ["calm", "emotional", "잔잔", "감성", "lofi", "relax", "acoustic"],
  긴장감: ["tension", "긴장", "서스펜스", "thriller", "suspense", "mystery"],
};

export function inferBgmCategory(title: string): BgmCategory {
  const titleLower = title.toLowerCase();
  for (const category of Object.keys(CATEGORY_KEYWORDS) as Exclude<BgmCategory, "기타">[]) {
    if (CATEGORY_KEYWORDS[category].some((keyword) => titleLower.includes(keyword.toLowerCase()))) {
      return category;
    }
  }
  return "기타";
}
