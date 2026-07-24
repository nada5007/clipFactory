import { beforeEach, describe, expect, it, vi } from "vitest";

import { listChannels, listVideos, searchVideos } from "@/lib/clients/youtube";
import { analyzeKeywordMarketability, getNichePopularVideos } from "@/server/services/explore.service";

vi.mock("@/lib/clients/youtube", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clients/youtube")>("@/lib/clients/youtube");
  return {
    ...actual,
    searchVideos: vi.fn(),
    listVideos: vi.fn(),
    listChannels: vi.fn(),
  };
});

describe("analyzeKeywordMarketability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("검색 결과가 없으면 0점을 반환하고 videos/channels API를 호출하지 않는다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [] });

    const result = await analyzeKeywordMarketability("존재하지않는키워드123");

    expect(result.score).toBe(0);
    expect(result.videos).toEqual([]);
    expect(listVideos).not.toHaveBeenCalled();
    expect(listChannels).not.toHaveBeenCalled();
  });

  it("검색→영상 통계→채널 구독자 정보를 조합해 점수를 산출한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({
      items: [{ id: { videoId: "v1" }, snippet: { title: "t", channelId: "c1", channelTitle: "ch", publishedAt: "2026-01-01T00:00:00Z", thumbnails: {} } }],
    });
    vi.mocked(listVideos).mockResolvedValue({
      items: [
        {
          id: "v1",
          snippet: { title: "t", channelId: "c1", channelTitle: "ch", publishedAt: new Date().toISOString() },
          statistics: { viewCount: "100000", likeCount: "5000" },
        },
      ],
    });
    vi.mocked(listChannels).mockResolvedValue({
      items: [
        {
          id: "c1",
          snippet: { title: "ch" },
          statistics: { subscriberCount: "1000" },
          contentDetails: { relatedPlaylists: { uploads: "u1" } },
        },
      ],
    });

    const result = await analyzeKeywordMarketability("테스트키워드");

    expect(result.keyword).toBe("테스트키워드");
    expect(result.stats.videoCount).toBe(1);
    expect(result.score).toBeGreaterThan(0);
    expect(listVideos).toHaveBeenCalledWith(["v1"]);
    expect(listChannels).toHaveBeenCalledWith(["c1"]);
  });
});

describe("getNichePopularVideos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("검색 결과가 없으면 빈 배열을 반환한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [] });

    const result = await getNichePopularVideos("부동산");

    expect(result).toEqual([]);
    expect(listVideos).not.toHaveBeenCalled();
  });

  it("니치 키워드로 검색해 영상 통계를 조회한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({
      items: [{ id: { videoId: "v1" }, snippet: { title: "t", channelId: "c1", channelTitle: "ch", publishedAt: "2026-01-01T00:00:00Z", thumbnails: {} } }],
    });
    vi.mocked(listVideos).mockResolvedValue({
      items: [{ id: "v1", snippet: { title: "t", channelId: "c1", channelTitle: "ch", publishedAt: "2026-01-01T00:00:00Z" }, statistics: { viewCount: "500" } }],
    });

    const result = await getNichePopularVideos("부동산");

    expect(searchVideos).toHaveBeenCalledWith(expect.objectContaining({ q: "부동산", regionCode: "KR" }));
    expect(result).toHaveLength(1);
  });
});
