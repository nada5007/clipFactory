import { describe, expect, it } from "vitest";

import { extractTopTopics } from "@/lib/tf-idf";

describe("extractTopTopics", () => {
  it("빈 제목 목록은 빈 배열을 반환한다", () => {
    expect(extractTopTopics([])).toEqual([]);
  });

  it("여러 제목에 걸쳐 반복되는 용어를 문서빈도 순으로 추출한다", () => {
    const titles = [
      "시니어건강 지키는 스트레칭 5가지",
      "시니어건강 챙기는 아침 루틴",
      "시니어건강 챙기는 식단 공개",
      "오늘의 여행 브이로그",
    ];

    const topics = extractTopTopics(titles, 5);
    const terms = topics.map((t) => t.term);
    expect(terms).toContain("시니어건강");
    const senior = topics.find((t) => t.term === "시니어건강");
    expect(senior?.count).toBe(3);
  });

  it("모든 제목에 고르게 등장하는 단어보다 일부에만 등장하는 변별력 있는 단어를 우선한다", () => {
    const titles = Array.from({ length: 10 }, (_, i) => `영상 ${i} 특집`).concat([
      "영상 특집 건강 정보",
      "영상 특집 건강 챙기기",
      "영상 특집 건강 루틴",
    ]);

    const topics = extractTopTopics(titles, 3);
    const terms = topics.map((t) => t.term);
    expect(terms).toContain("건강");
  });

  it("topN 개수만큼만 반환한다", () => {
    const titles = ["가나 다라 마바 사아 자차 카타 파하 거너 더러 머버"];
    expect(extractTopTopics(titles, 3)).toHaveLength(3);
  });
});
