import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { scoreSourceMatches, translateTitles } from "@/lib/clients/anthropic";
import { listVideos, searchVideos } from "@/lib/clients/youtube";
import { prisma } from "@/lib/prisma";
import { discoverSources } from "@/server/services/source-discovery.service";

vi.mock("@/lib/clients/anthropic", () => ({ scoreSourceMatches: vi.fn(), translateTitles: vi.fn() }));

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

  it("다중 지역·언어를 선택하면 지역별·언어별로 각각 검색해 결과를 중복 제거 후 병합한다", async () => {
    vi.mocked(searchVideos)
      .mockResolvedValueOnce({ items: [searchItem("v1"), searchItem("v2")] }) // region US
      .mockResolvedValueOnce({ items: [searchItem("v2"), searchItem("v3")] }) // region JP (v2 중복)
      .mockResolvedValueOnce({ items: [searchItem("v4")] }); // language en
    vi.mocked(listVideos).mockResolvedValue({
      items: ["v1", "v2", "v3", "v4"].map((id) => ({
        id,
        // 제목을 라틴(영어)으로 둬 아래 languages: ["en"] 문자권 필터를 통과하게 한다.
        snippet: { title: `Video ${id}`, channelTitle: "ch", channelId: "c", publishedAt: "2026-01-01T00:00:00Z" },
        statistics: { viewCount: "100" },
      })),
    });
    vi.mocked(scoreSourceMatches).mockResolvedValue([]);

    const result = await discoverSources({
      concept: `다중지역-${Date.now()}`,
      regionCodes: ["US", "JP"],
      languages: ["en"],
      excludeKorean: false,
    });

    expect(searchVideos).toHaveBeenCalledTimes(3);
    expect(result.candidateCount).toBe(4);
    expect(listVideos).toHaveBeenCalledWith(["v1", "v2", "v3", "v4"]);
  });

  it("minViewCount 미만인 영상은 제외한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v1"), searchItem("v2")] });
    vi.mocked(listVideos).mockResolvedValue({
      items: [
        { id: "v1", snippet: { title: "v1", channelTitle: "ch", channelId: "c", publishedAt: "2026-01-01T00:00:00Z" }, statistics: { viewCount: "500" } },
        { id: "v2", snippet: { title: "v2", channelTitle: "ch", channelId: "c", publishedAt: "2026-01-01T00:00:00Z" }, statistics: { viewCount: "50000" } },
      ],
    });
    vi.mocked(scoreSourceMatches).mockResolvedValue([{ index: 0, score: 80, reason: "", matchedKeywords: [] }]);

    const result = await discoverSources({
      concept: `최소조회수-${Date.now()}`,
      excludeKorean: false,
      minViewCount: 10000,
    });

    expect(result.videos.map((v) => v.id)).toEqual(["v2"]);
  });

  it("translateTitles 옵션이 켜지면 번역된 제목을 함께 반환한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v1")] });
    vi.mocked(listVideos).mockResolvedValue({
      items: [{ id: "v1", snippet: { title: "Hello World", channelTitle: "ch", channelId: "c", publishedAt: "2026-01-01T00:00:00Z" }, statistics: { viewCount: "100" } }],
    });
    vi.mocked(scoreSourceMatches).mockResolvedValue([{ index: 0, score: 80, reason: "", matchedKeywords: [] }]);
    vi.mocked(translateTitles).mockResolvedValue(["안녕 세계"]);

    const result = await discoverSources({
      concept: `번역테스트-${Date.now()}`,
      excludeKorean: false,
      translateTitles: true,
    });

    expect(result.videos[0].translatedTitle).toBe("안녕 세계");
  });

  it("정렬 옵션 VIEWS는 조회수 내림차순으로 정렬한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v1"), searchItem("v2")] });
    vi.mocked(listVideos).mockResolvedValue({
      items: [
        { id: "v1", snippet: { title: "v1", channelTitle: "ch", channelId: "c", publishedAt: "2026-01-01T00:00:00Z" }, statistics: { viewCount: "1000" } },
        { id: "v2", snippet: { title: "v2", channelTitle: "ch", channelId: "c", publishedAt: "2026-01-01T00:00:00Z" }, statistics: { viewCount: "9000" } },
      ],
    });
    vi.mocked(scoreSourceMatches).mockResolvedValue([
      { index: 0, score: 90, reason: "", matchedKeywords: [] },
      { index: 1, score: 10, reason: "", matchedKeywords: [] },
    ]);

    const result = await discoverSources({
      concept: `정렬테스트-${Date.now()}`,
      excludeKorean: false,
      sort: "VIEWS",
    });

    expect(result.videos.map((v) => v.id)).toEqual(["v2", "v1"]);
  });
});
