import { describe, expect, it } from "vitest";

import { computeKeywordMarketScore } from "@/lib/keyword-score";

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("computeKeywordMarketScore", () => {
  it("영상이 없으면 0점과 빈 통계를 반환한다", () => {
    const result = computeKeywordMarketScore([], []);
    expect(result.score).toBe(0);
    expect(result.stats.videoCount).toBe(0);
  });

  it("조회수·최신성·참여율이 높고 경쟁 채널 구독자가 적을수록 높은 점수를 준다", () => {
    const strongVideos = Array.from({ length: 10 }, (_, i) => ({
      viewCount: 1_000_000,
      likeCount: 100_000,
      publishedAt: daysAgo(1),
      channelId: `chan${i}`,
    }));
    const strongChannels = strongVideos.map((v) => ({ id: v.channelId, subscriberCount: 500 }));

    const weakVideos = Array.from({ length: 10 }, (_, i) => ({
      viewCount: 100,
      likeCount: 1,
      publishedAt: daysAgo(1000),
      channelId: `chan${i}`,
    }));
    const weakChannels = weakVideos.map((v) => ({ id: v.channelId, subscriberCount: 10_000_000 }));

    const strong = computeKeywordMarketScore(strongVideos, strongChannels);
    const weak = computeKeywordMarketScore(weakVideos, weakChannels);

    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.score).toBeGreaterThan(80);
    expect(weak.score).toBeLessThan(20);
  });

  it("점수는 0~100 범위를 벗어나지 않는다", () => {
    const videos = Array.from({ length: 5 }, (_, i) => ({
      viewCount: 50_000_000,
      likeCount: 50_000_000,
      publishedAt: daysAgo(0),
      channelId: `chan${i}`,
    }));
    const channels = videos.map((v) => ({ id: v.channelId, subscriberCount: 0 }));

    const result = computeKeywordMarketScore(videos, channels);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("breakdown 항목 합이 score와 일치한다", () => {
    const videos = [
      { viewCount: 200_000, likeCount: 8_000, publishedAt: daysAgo(10), channelId: "c1" },
      { viewCount: 50_000, likeCount: 500, publishedAt: daysAgo(200), channelId: "c2" },
    ];
    const channels = [
      { id: "c1", subscriberCount: 20_000 },
      { id: "c2", subscriberCount: 300_000 },
    ];

    const result = computeKeywordMarketScore(videos, channels);
    const sum =
      result.breakdown.viewScore +
      result.breakdown.recencyScore +
      result.breakdown.engagementScore +
      result.breakdown.competitionScore;
    expect(result.score).toBe(sum);
  });
});
