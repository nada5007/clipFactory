// UI_SPEC.md §7.1 "소스 영상 상세" "댓글" 탭: 원본 댓글 메타데이터(작성자·좋아요·답글수)를 보존해
// 의도 9분류·인기 댓글·핵심 인사이트·활발한 토론을 산출한다. YouTube API가 주는 값(좋아요/답글수)은
// 그대로 신뢰하고, 감정(sentiment)·의도(intent) 분류만 Anthropic API 결과를 사용한다.

export type CommentSentiment = "positive" | "neutral" | "negative";
export type CommentIntent = "공감" | "놀람" | "수요" | "질문" | "요청" | "칭찬" | "비판" | "기타";

export const COMMENT_INTENTS: CommentIntent[] = ["공감", "놀람", "수요", "질문", "요청", "칭찬", "비판", "기타"];

export type RawComment = { text: string; author: string; likeCount: number; replyCount: number };
export type ClassifiedComment = RawComment & { sentiment: CommentSentiment; intent: CommentIntent };

export type TopInsight = { intent: CommentIntent; comment: ClassifiedComment; suggestion: string };

export type CommentInsightSummary = {
  totalCount: number;
  uniqueAuthorCount: number;
  totalLikeCount: number;
  positiveRatio: number;
  neutralRatio: number;
  negativeRatio: number;
  intentCounts: Record<CommentIntent, number>;
  topInsights: TopInsight[];
  popularComments: ClassifiedComment[];
  activeDiscussions: ClassifiedComment[];
};

const INTENT_SUGGESTIONS: Record<CommentIntent, string> = {
  공감: "시청자 공감 1위 — 다음 영상에서 이 감정선을 다시 자극",
  놀람: "놀람 모먼트 1위 — 바이럴 가능 후킹 포인트",
  수요: "수요 1위 — 후속 콘텐츠 기획 힌트",
  질문: "가장 인기있는 질문 — FAQ 영상 후보",
  요청: "요청 1위 — 다음 영상 소재 후보",
  칭찬: "칭찬 1위 — 강점으로 어필할 포인트",
  비판: "비판 1위 — 개선 우선순위로 검토",
  기타: "기타 반응 중 가장 인기 있는 댓글",
};

const TOP_INSIGHT_COUNT = 3;
const POPULAR_COMMENT_COUNT = 10;
const ACTIVE_DISCUSSION_MIN_REPLIES = 5;
const ACTIVE_DISCUSSION_COUNT = 10;

export function buildCommentInsightSummary(comments: ClassifiedComment[]): CommentInsightSummary {
  const totalCount = comments.length;
  const uniqueAuthorCount = new Set(comments.map((c) => c.author)).size;
  const totalLikeCount = comments.reduce((sum, c) => sum + c.likeCount, 0);

  const sentimentCount = { positive: 0, neutral: 0, negative: 0 };
  for (const c of comments) sentimentCount[c.sentiment]++;

  const intentCounts = COMMENT_INTENTS.reduce(
    (acc, intent) => ({ ...acc, [intent]: comments.filter((c) => c.intent === intent).length }),
    {} as Record<CommentIntent, number>,
  );

  const topInsights: TopInsight[] = COMMENT_INTENTS.map((intent) => {
    const inIntent = comments.filter((c) => c.intent === intent);
    if (inIntent.length === 0) return null;
    const best = [...inIntent].sort((a, b) => b.likeCount - a.likeCount)[0];
    return { intent, comment: best, suggestion: INTENT_SUGGESTIONS[intent] };
  })
    .filter((x): x is TopInsight => x !== null)
    .sort((a, b) => b.comment.likeCount - a.comment.likeCount)
    .slice(0, TOP_INSIGHT_COUNT);

  const popularComments = [...comments].sort((a, b) => b.likeCount - a.likeCount).slice(0, POPULAR_COMMENT_COUNT);

  const activeDiscussions = comments
    .filter((c) => c.replyCount >= ACTIVE_DISCUSSION_MIN_REPLIES)
    .sort((a, b) => b.replyCount - a.replyCount)
    .slice(0, ACTIVE_DISCUSSION_COUNT);

  return {
    totalCount,
    uniqueAuthorCount,
    totalLikeCount,
    positiveRatio: totalCount > 0 ? sentimentCount.positive / totalCount : 0,
    neutralRatio: totalCount > 0 ? sentimentCount.neutral / totalCount : 0,
    negativeRatio: totalCount > 0 ? sentimentCount.negative / totalCount : 0,
    intentCounts,
    topInsights,
    popularComments,
    activeDiscussions,
  };
}
