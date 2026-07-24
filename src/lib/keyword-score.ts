// PROJECT_SPEC.md §2.3 "키워드 시장성 (2.4)": 조회수 분포(중앙값/상위10%)·최신성·참여율·경쟁 채널 구독자 분포를
// 종합한 단순 가중합(v1). 만점 배분 40/20/20/20 = 100.

export type KeywordScoreVideoInput = {
  viewCount: number;
  likeCount: number;
  publishedAt: string;
  channelId: string;
};

export type KeywordScoreChannelInput = {
  id: string;
  subscriberCount: number;
};

export type KeywordScoreResult = {
  score: number;
  breakdown: {
    viewScore: number;
    recencyScore: number;
    engagementScore: number;
    competitionScore: number;
  };
  stats: {
    videoCount: number;
    medianViewCount: number;
    top10PercentViewCount: number;
    avgEngagementRate: number;
    recentRatio: number;
    medianChannelSubscriberCount: number;
  };
  // UI_SPEC.md §7.1 "탐색·분석" 분석 모드 공식 산식: 추천 점수 = 검색량 점수 × (1 − 경쟁도).
  searchVolumeScore: number; // 0~100, 조회수 분포·최신성 기반 "검색량" 프록시
  competitionRatio: number; // 0~1, 경쟁 채널 구독자 규모 기반 "포화도" (70%+ = 이미 포화)
  recommendScore: number; // 0~100, searchVolumeScore * (1 - competitionRatio)
};

const RECENCY_WINDOW_DAYS = 90;
const ENGAGEMENT_REFERENCE_RATE = 0.1;
const VIEW_LOG_MAX = 6; // log10(1,000,000)
const SUBSCRIBER_LOG_MAX = 7; // log10(10,000,000)

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[index];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function logNormalize(value: number, logMax: number): number {
  return clamp01(Math.log10(value + 1) / logMax);
}

export function computeKeywordMarketScore(
  videos: KeywordScoreVideoInput[],
  channels: KeywordScoreChannelInput[],
): KeywordScoreResult {
  if (videos.length === 0) {
    return {
      score: 0,
      breakdown: { viewScore: 0, recencyScore: 0, engagementScore: 0, competitionScore: 0 },
      stats: {
        videoCount: 0,
        medianViewCount: 0,
        top10PercentViewCount: 0,
        avgEngagementRate: 0,
        recentRatio: 0,
        medianChannelSubscriberCount: 0,
      },
      searchVolumeScore: 0,
      competitionRatio: 0,
      recommendScore: 0,
    };
  }

  const viewCounts = videos.map((v) => v.viewCount);
  const medianViewCount = median(viewCounts);
  const top10PercentViewCount = percentile(viewCounts, 0.9);

  const now = Date.now();
  const recentCount = videos.filter(
    (v) => now - new Date(v.publishedAt).getTime() <= RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).length;
  const recentRatio = recentCount / videos.length;

  const engagementRates = videos.map((v) => (v.viewCount > 0 ? v.likeCount / v.viewCount : 0));
  const avgEngagementRate = engagementRates.reduce((sum, r) => sum + r, 0) / engagementRates.length;

  const subscriberCounts = channels.map((c) => c.subscriberCount);
  const medianChannelSubscriberCount = median(subscriberCounts);

  const viewScore =
    (0.6 * logNormalize(medianViewCount, VIEW_LOG_MAX) + 0.4 * logNormalize(top10PercentViewCount, VIEW_LOG_MAX)) *
    40;
  const recencyScore = recentRatio * 20;
  const engagementScore = clamp01(avgEngagementRate / ENGAGEMENT_REFERENCE_RATE) * 20;
  const competitionScore = (1 - logNormalize(medianChannelSubscriberCount, SUBSCRIBER_LOG_MAX)) * 20;

  const score = Math.round(viewScore + recencyScore + engagementScore + competitionScore);

  // UI_SPEC.md §7.1: 추천 점수 = 검색량 점수 × (1 − 경쟁도). 검색량 점수는 조회수 분포(60%)와 최신성(40%)을
  // 0~100으로 환산, 경쟁도는 경쟁 채널 구독자 규모(클수록 포화)를 0~1 비율로 환산한다.
  const searchVolumeScore = Math.round(
    (0.6 * (0.6 * logNormalize(medianViewCount, VIEW_LOG_MAX) + 0.4 * logNormalize(top10PercentViewCount, VIEW_LOG_MAX)) +
      0.4 * recentRatio) *
      100,
  );
  const competitionRatio = logNormalize(medianChannelSubscriberCount, SUBSCRIBER_LOG_MAX);
  const recommendScore = Math.round(searchVolumeScore * (1 - competitionRatio));

  return {
    score: Math.min(100, Math.max(0, score)),
    breakdown: {
      viewScore: Math.round(viewScore),
      recencyScore: Math.round(recencyScore),
      engagementScore: Math.round(engagementScore),
      competitionScore: Math.round(competitionScore),
    },
    stats: {
      videoCount: videos.length,
      medianViewCount,
      top10PercentViewCount,
      avgEngagementRate,
      recentRatio,
      medianChannelSubscriberCount,
    },
    searchVolumeScore,
    competitionRatio,
    recommendScore,
  };
}
