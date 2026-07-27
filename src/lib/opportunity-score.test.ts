import { describe, expect, it } from "vitest";

import {
  computeNewChannelShare,
  computeOpportunityScore,
  computeRecencyScore,
} from "@/lib/opportunity-score";

const NOW = new Date("2026-01-10T00:00:00.000Z");

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("computeRecencyScore", () => {
  it("빈 배열은 0을 반환한다", () => {
    expect(computeRecencyScore([], NOW)).toBe(0);
  });

  it("7일 이내 게시물은 100점이다", () => {
    expect(computeRecencyScore([daysAgo(0), daysAgo(7)], NOW)).toBe(100);
  });

  it("1년 이상 지난 게시물은 0점이다", () => {
    expect(computeRecencyScore([daysAgo(400)], NOW)).toBe(0);
  });

  it("7일과 1년 사이는 선형 보간한다", () => {
    const midDays = (7 + 365) / 2;
    const score = computeRecencyScore([daysAgo(midDays)], NOW);
    expect(score).toBeGreaterThan(40);
    expect(score).toBeLessThan(60);
  });

  it("여러 영상의 평균을 낸다", () => {
    const score = computeRecencyScore([daysAgo(0), daysAgo(400)], NOW);
    expect(score).toBe(50);
  });
});

describe("computeNewChannelShare", () => {
  it("빈 배열은 0을 반환한다", () => {
    expect(computeNewChannelShare([])).toBe(0);
  });

  it("구독자 10만 미만 채널 비율을 계산한다", () => {
    expect(computeNewChannelShare([50_000, 50_000, 200_000, 500_000])).toBe(50);
  });

  it("모든 채널이 10만 미만이면 100이다", () => {
    expect(computeNewChannelShare([1000, 2000, 3000])).toBe(100);
  });
});

describe("computeOpportunityScore", () => {
  it("기본 가중치(각 25%)로 4개 항목의 평균을 낸다", () => {
    const result = computeOpportunityScore({
      popularity: 80,
      entryDifficulty: 80,
      newChannelShare: 80,
      recency: 80,
    });
    expect(result.total).toBe(80);
  });

  it("가중치를 조정하면 그에 따라 재계산된다", () => {
    const breakdown = { popularity: 100, entryDifficulty: 0, newChannelShare: 0, recency: 0 };
    const result = computeOpportunityScore(breakdown, {
      popularity: 1,
      entryDifficulty: 0,
      newChannelShare: 0,
      recency: 0,
    });
    expect(result.total).toBe(100);
  });

  it("breakdown 필드를 결과에 그대로 포함한다", () => {
    const breakdown = { popularity: 10, entryDifficulty: 20, newChannelShare: 30, recency: 40 };
    const result = computeOpportunityScore(breakdown);
    expect(result.popularity).toBe(10);
    expect(result.entryDifficulty).toBe(20);
    expect(result.newChannelShare).toBe(30);
    expect(result.recency).toBe(40);
  });
});
