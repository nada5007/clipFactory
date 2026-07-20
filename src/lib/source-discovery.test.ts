import { describe, expect, it } from "vitest";

import { filterKoreanContent, looksKorean } from "@/lib/source-discovery";

describe("looksKorean", () => {
  it("한글 비중이 높은 텍스트는 한국 콘텐츠로 판정한다", () => {
    expect(looksKorean("한국 진돗개 훈련 브이로그")).toBe(true);
  });

  it("영어 텍스트는 한국 콘텐츠가 아니라고 판정한다", () => {
    expect(looksKorean("Foreigner reacts to Korean dog training")).toBe(false);
  });

  it("영문 제목에 한글 채널명이 섞여도 한글 비중이 낮으면 아니라고 판정한다", () => {
    expect(looksKorean("Amazing Jindo Dog Training Compilation 2026")).toBe(false);
  });

  it("빈 문자열은 한국 콘텐츠가 아니라고 판정한다", () => {
    expect(looksKorean("")).toBe(false);
  });
});

describe("filterKoreanContent", () => {
  const items = [
    { title: "한국 진돗개 훈련", channelTitle: "채널A" },
    { title: "Foreigner reacts to Korean culture", channelTitle: "Channel B" },
  ];

  it("excludeKorean이 false면 그대로 반환한다", () => {
    expect(filterKoreanContent(items, false)).toHaveLength(2);
  });

  it("excludeKorean이 true면 한국 콘텐츠를 제외한다", () => {
    const result = filterKoreanContent(items, true);
    expect(result).toHaveLength(1);
    expect(result[0].title).toContain("Foreigner");
  });
});
