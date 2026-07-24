import { describe, expect, it } from "vitest";

import { resolveDateRange } from "@/lib/date-range";

const NOW = new Date("2026-01-01T00:00:00.000Z");

describe("resolveDateRange", () => {
  it("ALL은 제약이 없다", () => {
    expect(resolveDateRange("ALL", NOW)).toEqual({});
  });

  it("30D는 30일 전 이후만 포함하는 publishedAfter를 준다", () => {
    const result = resolveDateRange("30D", NOW);
    expect(result.publishedAfter).toBe("2025-12-02T00:00:00.000Z");
    expect(result.publishedBefore).toBeUndefined();
  });

  it("1Y는 365일 전 publishedAfter를 준다", () => {
    expect(resolveDateRange("1Y", NOW).publishedAfter).toBe("2025-01-01T00:00:00.000Z");
  });

  it("5Y_PLUS는 publishedAfter가 아니라 publishedBefore(약 5년 전)를 준다", () => {
    const result = resolveDateRange("5Y_PLUS", NOW);
    expect(result.publishedBefore).toBe(new Date(NOW.getTime() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString());
    expect(result.publishedAfter).toBeUndefined();
  });

  it("10Y_PLUS는 publishedBefore(약 10년 전)를 준다", () => {
    const result = resolveDateRange("10Y_PLUS", NOW);
    expect(result.publishedBefore).toBe(new Date(NOW.getTime() - 10 * 365 * 24 * 60 * 60 * 1000).toISOString());
  });
});
