import { describe, expect, it } from "vitest";

import { buildCommentInsightSummary, type ClassifiedComment } from "@/lib/comment-insight";

function comment(overrides: Partial<ClassifiedComment> = {}): ClassifiedComment {
  return {
    text: "댓글",
    author: "user",
    likeCount: 0,
    replyCount: 0,
    sentiment: "neutral",
    intent: "기타",
    ...overrides,
  };
}

describe("buildCommentInsightSummary", () => {
  it("빈 댓글 목록은 0/빈 배열로 채워진 요약을 반환한다", () => {
    const result = buildCommentInsightSummary([]);
    expect(result.totalCount).toBe(0);
    expect(result.uniqueAuthorCount).toBe(0);
    expect(result.positiveRatio).toBe(0);
    expect(result.topInsights).toEqual([]);
    expect(result.popularComments).toEqual([]);
  });

  it("유니크 작성자 수와 총 좋아요 합계를 계산한다", () => {
    const comments = [
      comment({ author: "a", likeCount: 10 }),
      comment({ author: "a", likeCount: 5 }),
      comment({ author: "b", likeCount: 3 }),
    ];
    const result = buildCommentInsightSummary(comments);
    expect(result.uniqueAuthorCount).toBe(2);
    expect(result.totalLikeCount).toBe(18);
  });

  it("감정 비율을 계산한다", () => {
    const comments = [
      comment({ sentiment: "positive" }),
      comment({ sentiment: "positive" }),
      comment({ sentiment: "negative" }),
      comment({ sentiment: "neutral" }),
    ];
    const result = buildCommentInsightSummary(comments);
    expect(result.positiveRatio).toBe(0.5);
    expect(result.negativeRatio).toBe(0.25);
    expect(result.neutralRatio).toBe(0.25);
  });

  it("의도별 건수를 집계한다", () => {
    const comments = [comment({ intent: "질문" }), comment({ intent: "질문" }), comment({ intent: "칭찬" })];
    const result = buildCommentInsightSummary(comments);
    expect(result.intentCounts.질문).toBe(2);
    expect(result.intentCounts.칭찬).toBe(1);
    expect(result.intentCounts.비판).toBe(0);
  });

  it("각 카테고리에서 좋아요 1위 댓글로 핵심 인사이트를 만들고 좋아요순 상위 3개만 남긴다", () => {
    const comments = [
      comment({ intent: "공감", text: "공감1", likeCount: 5 }),
      comment({ intent: "공감", text: "공감2(1위)", likeCount: 50 }),
      comment({ intent: "놀람", text: "놀람1(1위)", likeCount: 100 }),
      comment({ intent: "질문", text: "질문1(1위)", likeCount: 30 }),
      comment({ intent: "요청", text: "요청1(1위)", likeCount: 10 }),
    ];
    const result = buildCommentInsightSummary(comments);
    expect(result.topInsights).toHaveLength(3);
    expect(result.topInsights[0].comment.text).toBe("놀람1(1위)");
    expect(result.topInsights.map((i) => i.comment.text)).toContain("공감2(1위)");
    expect(result.topInsights.map((i) => i.comment.text)).toContain("질문1(1위)");
    expect(result.topInsights.map((i) => i.comment.text)).not.toContain("요청1(1위)");
  });

  it("인기 댓글은 좋아요순 상위 10개로 제한한다", () => {
    const comments = Array.from({ length: 15 }, (_, i) => comment({ text: `c${i}`, likeCount: i }));
    const result = buildCommentInsightSummary(comments);
    expect(result.popularComments).toHaveLength(10);
    expect(result.popularComments[0].text).toBe("c14");
  });

  it("답글 5개 이상인 댓글만 활발한 토론으로 분류한다", () => {
    const comments = [
      comment({ text: "많음", replyCount: 10 }),
      comment({ text: "적음", replyCount: 2 }),
      comment({ text: "경계값", replyCount: 5 }),
    ];
    const result = buildCommentInsightSummary(comments);
    expect(result.activeDiscussions.map((c) => c.text)).toEqual(["많음", "경계값"]);
  });
});
