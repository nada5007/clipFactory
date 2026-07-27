import { describe, expect, it } from "vitest";

import { surgePeriodToPublishedAfter } from "@/lib/surge-options";

const NOW = new Date("2026-01-10T00:00:00.000Z");

describe("surgePeriodToPublishedAfter", () => {
  it("all은 undefined를 반환한다 (기간 제한 없음)", () => {
    expect(surgePeriodToPublishedAfter("all", NOW)).toBeUndefined();
  });

  it("1h는 1시간 전 시각을 반환한다", () => {
    const result = surgePeriodToPublishedAfter("1h", NOW);
    expect(result).toBe(new Date(NOW.getTime() - 60 * 60 * 1000).toISOString());
  });

  it("30d는 30일 전 시각을 반환한다", () => {
    const result = surgePeriodToPublishedAfter("30d", NOW);
    expect(result).toBe(new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString());
  });
});
