import { describe, expect, it } from "vitest";

import { splitIntoSentences } from "@/lib/text";

describe("splitIntoSentences", () => {
  it("문장부호 기준으로 분리한다", () => {
    expect(splitIntoSentences("안녕하세요. 반갑습니다! 오늘 날씨 어때요?")).toEqual([
      "안녕하세요.",
      "반갑습니다!",
      "오늘 날씨 어때요?",
    ]);
  });

  it("줄바꿈으로도 분리한다", () => {
    expect(splitIntoSentences("첫 줄\n둘째 줄")).toEqual(["첫 줄", "둘째 줄"]);
  });

  it("빈 문장은 제거한다", () => {
    expect(splitIntoSentences("문장 하나.\n\n\n문장 둘.")).toEqual(["문장 하나.", "문장 둘."]);
  });

  it("빈 입력은 빈 배열을 반환한다", () => {
    expect(splitIntoSentences("   ")).toEqual([]);
  });
});
