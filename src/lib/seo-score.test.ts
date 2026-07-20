import { describe, expect, it } from "vitest";

import { computeGeneralSeoScore, computeKeywordSeoScore, type SeoVideoInput } from "@/lib/seo-score";

function video(overrides: Partial<SeoVideoInput> = {}): SeoVideoInput {
  return {
    title: "시니어건강 홈트레이닝 30분 완성 루틴 총정리",
    description:
      "시니어건강 홈트레이닝 30분 완성 루틴을 소개합니다. 구독과 좋아요 부탁드려요! 0:00 인트로 1:30 본문 5:00 마무리 " +
      "내용".repeat(60),
    tags: Array.from({ length: 15 }, (_, i) => `시니어건강 홈트레이닝 관련 태그 예시 문구 ${i}`),
    hasMaxResThumbnail: true,
    ...overrides,
  };
}

describe("computeGeneralSeoScore", () => {
  it("모든 항목이 이상적이면 100점에 가까운 총점을 준다", () => {
    const result = computeGeneralSeoScore(video());
    expect(result.mode).toBe("general");
    expect(result.total).toBeGreaterThan(80);
    expect(result.items).toHaveLength(5);
  });

  it("빈 메타데이터는 낮은 점수와 개선 제안을 준다", () => {
    const result = computeGeneralSeoScore(video({ title: "짧음", description: "", tags: [], hasMaxResThumbnail: false }));
    expect(result.total).toBeLessThan(30);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.bestPractices.every((b) => !b.passed)).toBe(true);
  });

  it("베스트 프랙티스 5종을 모두 판정한다", () => {
    const result = computeGeneralSeoScore(video());
    expect(result.bestPractices.map((b) => b.key)).toEqual([
      "thumbnail_resolution",
      "timestamps",
      "cta_in_description",
      "tag_count",
      "description_length",
    ]);
  });
});

describe("computeKeywordSeoScore", () => {
  it("제목·설명·태그에 키워드가 있으면 높은 점수를 준다", () => {
    const result = computeKeywordSeoScore(
      video({
        title: "시니어건강을 위한 운동법 총정리 가이드입니다",
        description: "시니어건강 관리에 좋은 습관 " + "내용".repeat(50),
        tags: ["시니어건강", "운동"],
      }),
      "시니어건강",
    );

    expect(result.mode).toBe("keyword");
    expect(result.targetKeyword).toBe("시니어건강");
    const titleItem = result.items.find((i) => i.key === "title");
    const tagsItem = result.items.find((i) => i.key === "tags");
    expect(titleItem?.detail).toContain("키워드 포함");
    expect(tagsItem?.score).toBe(20);
  });

  it("키워드가 전혀 없으면 낮은 점수와 관련 제안을 준다", () => {
    const result = computeKeywordSeoScore(video(), "존재하지않는키워드");

    const titleItem = result.items.find((i) => i.key === "title");
    expect(titleItem?.detail).toContain("키워드 미포함");
    expect(result.suggestions.some((s) => s.includes("존재하지않는키워드"))).toBe(true);
  });
});
