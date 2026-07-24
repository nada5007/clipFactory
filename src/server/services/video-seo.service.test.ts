import { beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeComments } from "@/lib/clients/anthropic";
import { getVideoDetail, listCommentThreads, listVideos, searchVideos } from "@/lib/clients/youtube";
import { analyzeVideoSeo } from "@/server/services/video-seo.service";

vi.mock("@/lib/clients/anthropic", () => ({ analyzeComments: vi.fn() }));

vi.mock("@/lib/clients/youtube", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clients/youtube")>("@/lib/clients/youtube");
  return {
    ...actual,
    getVideoDetail: vi.fn(),
    listCommentThreads: vi.fn(),
    listVideos: vi.fn(),
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
          categoryId: "20",
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(searchVideos).mockResolvedValue({ items: [] });
    vi.mocked(listVideos).mockResolvedValue({ items: [] });
  });

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
      items: [
        {
          snippet: {
            topLevelComment: { snippet: { textDisplay: "좋아요!", likeCount: 1, authorDisplayName: "a" } },
            totalReplyCount: 0,
          },
        },
      ],
    });
    vi.mocked(analyzeComments).mockResolvedValue({
      classifications: [{ index: 0, sentiment: "positive", intent: "칭찬" }],
      frequentQuestions: [],
      summary: "긍정적",
    });
    vi.mocked(searchVideos).mockResolvedValue({
      items: [
        { id: { videoId: "dQw4w9WgXcQ" }, snippet: { title: "t", channelId: "c", channelTitle: "c", publishedAt: "2026-01-01T00:00:00Z", thumbnails: {} } },
        { id: { videoId: "other1" }, snippet: { title: "t2", channelId: "c2", channelTitle: "c2", publishedAt: "2026-01-01T00:00:00Z", thumbnails: {} } },
      ],
    });
    vi.mocked(listVideos).mockResolvedValue({
      items: [
        {
          id: "other1",
          snippet: { title: "t2", channelId: "c2", channelTitle: "c2", publishedAt: "2026-01-01T00:00:00Z" },
          statistics: { viewCount: "999" },
        },
      ],
    });

    const report = await analyzeVideoSeo("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    expect(report.seo.mode).toBe("general");
    expect(report.comments.summary).toBe("긍정적");
    expect(report.comments.insight?.positiveRatio).toBe(1);
    expect(report.similarVideos.map((v) => v.id)).toEqual(["other1"]);
    expect(report.performance.vph).toBeGreaterThanOrEqual(0);
  });

  it("타깃 키워드가 있으면 keyword 모드로 계산한다", async () => {
    vi.mocked(getVideoDetail).mockResolvedValue(fakeVideoDetail());
    vi.mocked(listCommentThreads).mockResolvedValue({ items: [] });

    const report = await analyzeVideoSeo("dQw4w9WgXcQ", "테스트");

    expect(report.seo.mode).toBe("keyword");
    expect(report.seo.targetKeyword).toBe("테스트");
    expect(report.comments.insight).toBeNull();
    expect(analyzeComments).not.toHaveBeenCalled();
  });

  it("댓글 분석이 실패해도 SEO 결과는 정상 반환한다", async () => {
    vi.mocked(getVideoDetail).mockResolvedValue(fakeVideoDetail());
    vi.mocked(listCommentThreads).mockRejectedValue(new Error("댓글이 비활성화된 영상입니다."));

    const report = await analyzeVideoSeo("dQw4w9WgXcQ");

    expect(report.comments.error).toBe("댓글이 비활성화된 영상입니다.");
    expect(report.seo.total).toBeGreaterThanOrEqual(0);
  });

  it("설명란에 챕터 타임스탬프가 2개 이상이면 챕터를 파싱한다", async () => {
    vi.mocked(getVideoDetail).mockResolvedValue({
      items: [
        {
          ...fakeVideoDetail().items[0],
          snippet: {
            ...fakeVideoDetail().items[0].snippet,
            description: "0:00 인트로\n1:00 본론",
          },
        },
      ],
    });
    vi.mocked(listCommentThreads).mockResolvedValue({ items: [] });

    const report = await analyzeVideoSeo("dQw4w9WgXcQ");

    expect(report.chapters).toEqual([
      { timestamp: "0:00", label: "인트로" },
      { timestamp: "1:00", label: "본론" },
    ]);
  });

  it("같은 채널 영상은 channelId로 검색해 조회수 순으로 조회한다", async () => {
    vi.mocked(getVideoDetail).mockResolvedValue(fakeVideoDetail());
    vi.mocked(listCommentThreads).mockResolvedValue({ items: [] });
    vi.mocked(searchVideos).mockImplementation((params: { channelId?: string }) => {
      if (params.channelId === "c1") {
        return Promise.resolve({
          items: [{ id: { videoId: "same1" }, snippet: { title: "s", channelId: "c1", channelTitle: "t", publishedAt: "2026-01-01T00:00:00Z", thumbnails: {} } }],
        });
      }
      return Promise.resolve({ items: [] });
    });
    vi.mocked(listVideos).mockResolvedValue({
      items: [{ id: "same1", snippet: { title: "s", channelId: "c1", channelTitle: "t", publishedAt: "2026-01-01T00:00:00Z" }, statistics: { viewCount: "777" } }],
    });

    const report = await analyzeVideoSeo("dQw4w9WgXcQ");

    expect(searchVideos).toHaveBeenCalledWith(expect.objectContaining({ channelId: "c1", order: "viewCount" }));
    expect(report.sameChannelVideos).toEqual([{ id: "same1", title: "s", channelTitle: "t", viewCount: 777 }]);
  });
});
