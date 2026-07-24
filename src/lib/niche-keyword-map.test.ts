import { describe, expect, it } from "vitest";

import { NICHE_CATALOG } from "@/lib/niche-catalog";
import { getNicheKeywordEntry } from "@/lib/niche-keyword-map";

describe("NICHE_KEYWORD_MAP", () => {
  it("NICHE_CATALOG의 모든 니치에 대해 키워드·제목 매칭 항목이 존재한다", () => {
    for (const niche of NICHE_CATALOG) {
      const entry = getNicheKeywordEntry(niche);
      expect(entry, `${niche}에 대한 매핑 누락`).toBeDefined();
      expect(entry?.keywords.length).toBeGreaterThan(0);
    }
  });

  it("제목 매칭 정규식이 실제로 관련 제목을 매칭한다", () => {
    expect(getNicheKeywordEntry("부동산")?.titlePattern.test("서울 아파트 청약 총정리")).toBe(true);
    expect(getNicheKeywordEntry("먹방·혼밥")?.titlePattern.test("혼자 먹는 야식 먹방")).toBe(true);
  });
});
