import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scoreSourceMatches } from "@/lib/clients/anthropic";
import { listVideos, searchVideos } from "@/lib/clients/youtube";
import { prisma } from "@/lib/prisma";
import { discoverSources } from "@/server/services/source-discovery.service";

vi.mock("@/lib/clients/anthropic", () => ({ scoreSourceMatches: vi.fn() }));

vi.mock("@/lib/clients/youtube", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clients/youtube")>("@/lib/clients/youtube");
  return { ...actual, searchVideos: vi.fn(), listVideos: vi.fn() };
});

function searchItem(id: string) {
  return {
    id: { videoId: id },
    snippet: { title: "t", channelId: "c", channelTitle: "ch", publishedAt: "2026-01-01T00:00:00Z", thumbnails: {} },
  };
}

describe("discoverSources", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(async () => {
    await prisma.apiCache.deleteMany({ where: { cacheKey: { startsWith: "source-discovery:" } } });
  });

  it("검색 결과가 없으면 빈 결과를 반환하고 매치 점수 API를 호출하지 않는다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [] });

    const result = await discoverSources({ concept: `없는컨셉-${Date.now()}` });

    expect(result.videos).toEqual([]);
    expect(scoreSourceMatches).not.toHaveBeenCalled();
  });

  it("한국 콘텐츠 제외 옵션이 켜져 있으면 필터링 후 매치 점수를 산정하고 점수 순으로 정렬한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({
      items: [searchItem("v1"), searchItem("v2"), searchItem("v3")],
    });
    vi.mocked(listVideos).mockResolvedValue({
      items: [
        { id: "v1", snippet: { title: "Foreigner reacts to Korean food", channelTitle: "GlobalChannel", channelId: "c1", publishedAt: "2026-01-01T00:00:00Z" }, statistics: {} },
        { id: "v2", snippet: { title: "한국 음식 리뷰", channelTitle: "한국채널", channelId: "c2", publishedAt: "2026-01-01T00:00:00Z" }, statistics: {} },
        { id: "v3", snippet: { title: "Amazing street food tour", channelTitle: "FoodTour", channelId: "c3", publishedAt: "2026-01-01T00:00:00Z" }, statistics: {} },
      ],
    });
    vi.mocked(scoreSourceMatches).mockResolvedValue([
      { index: 0, score: 60, reason: "관련 있음", matchedKeywords: ["korean", "food"] },
      { index: 1, score: 90, reason: "매우 관련 있음", matchedKeywords: ["food"] },
    ]);

    const result = await discoverSources({ concept: `테스트컨셉-${Date.now()}`, excludeKorean: true });

    // v2(한국 콘텐츠)는 제외되어 필터 후 후보가 [v1, v3] 2개이므로 매치 점수 인덱스는 그 2개 기준
    expect(scoreSourceMatches).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ title: "Foreigner reacts to Korean food" })]),
    );
    expect(result.videos.every((v) => v.id !== "v2")).toBe(true);
    expect(result.videos[0].matchScore).toBeGreaterThanOrEqual(result.videos[1]?.matchScore ?? 0);
  });
});
