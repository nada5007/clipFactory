import { describe, expect, it } from "vitest";

import { computeEstimatedRevenueKrw, computePerformanceTier, computeVph } from "@/lib/performance-tier";

const NOW = new Date("2026-01-10T00:00:00.000Z");

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

describe("computeVph", () => {
  it("경과 시간당 조회수를 계산한다", () => {
    expect(computeVph(1000, hoursAgo(10), NOW)).toBeCloseTo(100, 5);
  });

  it("게시 직후(0시간)에도 0으로 나누지 않는다", () => {
    expect(computeVph(500, NOW.toISOString(), NOW)).toBe(500);
  });
});

describe("computePerformanceTier", () => {
  it("최근 3일 이내 + VPH 500 이상은 폭발적이다", () => {
    expect(computePerformanceTier(50_000, hoursAgo(24), NOW)).toBe("explosive");
  });

  it("최근 7일 이내 + VPH 100 이상은 상승세다", () => {
    expect(computePerformanceTier(15_000, hoursAgo(150), NOW)).toBe("rising");
  });

  it("최근 30일 이내 + VPH 20 이상은 안정 성장이다", () => {
    expect(computePerformanceTier(10_000, hoursAgo(500), NOW)).toBe("steady_growth");
  });

  it("30일 초과 + VPH 5 이상은 장기 영상이다", () => {
    expect(computePerformanceTier(20_000, hoursAgo(24 * 60), NOW)).toBe("evergreen");
  });

  it("어느 조건도 만족하지 못하면 정체다", () => {
    expect(computePerformanceTier(10, hoursAgo(24 * 90), NOW)).toBe("stagnant");
  });
});

describe("computeEstimatedRevenueKrw", () => {
  it("조회수와 카테고리 RPM으로 추정 수익을 계산한다", () => {
    expect(computeEstimatedRevenueKrw(100_000, "20")).toBe(15_000);
  });

  it("존재하지 않는 카테고리는 전체 카테고리 RPM으로 폴백한다", () => {
    expect(computeEstimatedRevenueKrw(1000, "존재하지않음")).toBe(200);
  });
});
