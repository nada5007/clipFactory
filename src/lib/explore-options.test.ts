import { describe, expect, it } from "vitest";

import { classifyVideoForm, findExploreCategory, minViewFilterToCount, periodToHours } from "@/lib/explore-options";

describe("classifyVideoForm", () => {
  it("180초 이하는 short로 분류한다", () => {
    expect(classifyVideoForm(180)).toBe("short");
    expect(classifyVideoForm(59)).toBe("short");
  });

  it("180초 초과는 long으로 분류한다", () => {
    expect(classifyVideoForm(181)).toBe("long");
    expect(classifyVideoForm(600)).toBe("long");
  });
});

describe("periodToHours", () => {
  it("각 기간 옵션을 시간 단위로 변환한다", () => {
    expect(periodToHours("1h")).toBe(1);
    expect(periodToHours("6h")).toBe(6);
    expect(periodToHours("24h")).toBe(24);
    expect(periodToHours("7d")).toBe(168);
    expect(periodToHours("30d")).toBe(720);
  });
});

describe("minViewFilterToCount", () => {
  it("all은 0으로, 나머지는 숫자값으로 변환한다", () => {
    expect(minViewFilterToCount("all")).toBe(0);
    expect(minViewFilterToCount("10000")).toBe(10000);
    expect(minViewFilterToCount("1000000")).toBe(1000000);
  });
});

describe("findExploreCategory", () => {
  it("존재하는 id는 해당 카테고리를 반환한다", () => {
    expect(findExploreCategory("10").label).toBe("음악");
  });

  it("존재하지 않는 id는 첫 번째(전체) 카테고리로 폴백한다", () => {
    expect(findExploreCategory("존재하지않음").id).toBe("ALL");
  });
});
