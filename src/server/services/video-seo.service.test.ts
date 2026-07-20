import { beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeComments } from "@/lib/clients/anthropic";
import { getVideoDetail, listCommentThreads, searchVideos } from "@/lib/clients/youtube";
import { analyzeVideoSeo } from "@/server/services/video-seo.service";

vi.mock("@/lib/clients/anthropic", () => ({ analyzeComments: vi.fn() }));

vi.mock("@/lib/clients/youtube", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clients/youtube")>("@/lib/clients/youtube");
  return {
    ...actual,
    getVideoDetail: vi.fn(),
    listCommentThreads: vi.fn(),
    searchVideos: vi.fn(),
  };
});

function fakeVideoDetail() {
  return {
    items: [
      {
        id: "dQw4w9WgXcQ",
        snippet: {
          title: "테스트 영상 제목",
          description: "구독과 좋아요 부탁드려요! 0:00 인트로",
          channelId: "c1",
          channelTitle: "테스트 채널",
          publishedAt: "2026-01-01T00:00:00Z",
          tags: ["태그1", "태그2"],
          thumbnails: {},
        },
        statistics: { viewCount: "10000", likeCount: "500", commentCount: "20" },
        contentDetails: { duration: "PT1M30S" },
      },
    ],
  };
}

describe("analyzeVideoSeo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("잘못된 입력이면 에러를 던진다", async () => {
    await expect(analyzeVideoSeo("아무거나")).rejects.toThrow("올바른 YouTube 영상 URL 또는 ID를 입력하세요.");
  });

  it("영상을 찾지 못하면 에러를 던진다", async () => {
    vi.mocked(getVideoDetail).mockResolvedValue({ items: [] });
    await expect(analyzeVideoSeo("dQw4w9WgXcQ")).rejects.toThrow("영상을 찾을 수 없습니다.");
  });

  it("타깃 키워드 없이 분석하면 general 모드 SEO 점수를 계산한다", async () => {
    vi.mocked(getVideoDetail).mockResolvedValue(fakeVideoDetail());
    vi.mocked(listCommentThreads).mockResolvedValue({
      items: [{ snippet: { topLevelComment: { snippet: { textDisplay: "좋아요!", likeCount: 1, authorDisplayName: "a" } } } }],
    });
    vi.mocked(analyzeComments).mockResolvedValue({
      positiveRatio: 1,
      neutralRatio: 0,
      negativeRatio: 0,
      keywordClusters: ["좋아요"],
      frequentQuestions: [],
      summary: "긍정적",
    });
    vi.mocked(searchVideos).mockResolvedValue({
      items: [
        { id: { videoId: "dQw4w9WgXcQ" }, snippet: { title: "t", channelId: "c", channelTitle: "c", publishedAt: "2026-01-01T00:00:00Z", thumbnails: {} } },
        { id: { videoId: "other1" }, snippet: { title: "t2", channelId: "c2", channelTitle: "c2", publishedAt: "2026-01-01T00:00:00Z", thumbnails: {} } },
      ],
    });

    const report = await analyzeVideoSeo("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    expect(report.seo.mode).toBe("general");
    expect(report.comments.analysis?.summary).toBe("긍정적");
    expect(report.similarVideos.map((v) => v.id.videoId)).toEqual(["other1"]);
  });

  it("타깃 키워드가 있으면 keyword 모드로 계산한다", async () => {
    vi.mocked(getVideoDetail).mockResolvedValue(fakeVideoDetail());
    vi.mocked(listCommentThreads).mockResolvedValue({ items: [] });
    vi.mocked(searchVideos).mockResolvedValue({ items: [] });

    const report = await analyzeVideoSeo("dQw4w9WgXcQ", "테스트");

    expect(report.seo.mode).toBe("keyword");
    expect(report.seo.targetKeyword).toBe("테스트");
    expect(report.comments.analysis).toBeNull();
    expect(analyzeComments).not.toHaveBeenCalled();
  });

  it("댓글 분석이 실패해도 SEO 결과는 정상 반환한다", async () => {
    vi.mocked(getVideoDetail).mockResolvedValue(fakeVideoDetail());
    vi.mocked(listCommentThreads).mockRejectedValue(new Error("댓글이 비활성화된 영상입니다."));
    vi.mocked(searchVideos).mockResolvedValue({ items: [] });

    const report = await analyzeVideoSeo("dQw4w9WgXcQ");

    expect(report.comments.error).toBe("댓글이 비활성화된 영상입니다.");
    expect(report.seo.total).toBeGreaterThanOrEqual(0);
  });
});
