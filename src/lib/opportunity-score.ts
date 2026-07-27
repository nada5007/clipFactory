// UI_SPEC.md §7.1 "탐색·분석" 분석 모드 "종합 기회 점수" (원본 서비스 스크린샷 기준, 자체 산출 파생 지표):
// 인기도 + 진입 난이도(경쟁도 역수) + 신생 채널 비중 + 최신성의 가중합. 높을수록 "지금 새로 만들기 좋은 키워드".

export type OpportunityScoreBreakdown = {
  popularity: number; // 0~100, 검색량 점수와 동일
  entryDifficulty: number; // 0~100, 100 - 경쟁도 점수 (높을수록 진입 쉬움)
  newChannelShare: number; // 0~100, 표본 중 구독자 10만 미만 채널 비율
  recency: number; // 0~100, 게시 7일 이내=100점, 1년 이상=0점 선형 보간
};

export type OpportunityWeights = {
  popularity: number;
  entryDifficulty: number;
  newChannelShare: number;
  recency: number;
};

export type OpportunityScore = OpportunityScoreBreakdown & { total: number };

export const DEFAULT_OPPORTUNITY_WEIGHTS: OpportunityWeights = {
  popularity: 0.25,
  entryDifficulty: 0.25,
  newChannelShare: 0.25,
  recency: 0.25,
};

const NEW_CHANNEL_SUBSCRIBER_THRESHOLD = 100_000;
const RECENCY_FULL_SCORE_DAYS = 7;
const RECENCY_ZERO_SCORE_DAYS = 365;

export function computeRecencyScore(publishedAtList: string[], now: Date = new Date()): number {
  if (publishedAtList.length === 0) return 0;

  const scores = publishedAtList.map((publishedAt) => {
    const days = (now.getTime() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (days <= RECENCY_FULL_SCORE_DAYS) return 100;
    if (days >= RECENCY_ZERO_SCORE_DAYS) return 0;
    const span = RECENCY_ZERO_SCORE_DAYS - RECENCY_FULL_SCORE_DAYS;
    return 100 * (1 - (days - RECENCY_FULL_SCORE_DAYS) / span);
  });

  return Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
}

export function computeNewChannelShare(
  subscriberCounts: number[],
  threshold = NEW_CHANNEL_SUBSCRIBER_THRESHOLD,
): number {
  if (subscriberCounts.length === 0) return 0;
  const newChannelCount = subscriberCounts.filter((c) => c < threshold).length;
  return Math.round((newChannelCount / subscriberCounts.length) * 100);
}

function clampWeightedTotal(breakdown: OpportunityScoreBreakdown, weights: OpportunityWeights): number {
  const weightSum = weights.popularity + weights.entryDifficulty + weights.newChannelShare + weights.recency;
  if (weightSum <= 0) return 0;

  const weighted =
    breakdown.popularity * weights.popularity +
    breakdown.entryDifficulty * weights.entryDifficulty +
    breakdown.newChannelShare * weights.newChannelShare +
    breakdown.recency * weights.recency;

  return Math.round(weighted / weightSum);
}

export function computeOpportunityScore(
  breakdown: OpportunityScoreBreakdown,
  weights: OpportunityWeights = DEFAULT_OPPORTUNITY_WEIGHTS,
): OpportunityScore {
  return { ...breakdown, total: clampWeightedTotal(breakdown, weights) };
}
