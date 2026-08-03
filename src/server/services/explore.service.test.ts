import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateRelatedKeywords } from "@/lib/clients/anthropic";
import { listChannels, listPopularVideos, listVideos, searchVideos } from "@/lib/clients/youtube";
import { prisma } from "@/lib/prisma";
import {
  analyzeKeywordMarketability,
  analyzeKeywordsBulk,
  browseVideos,
  computeIdeaMarketScore,
  getNichePopularVideos,
  getNicheTopPerformers,
  suggestRelatedKeywords,
} from "@/server/services/explore.service";

vi.mock("@/lib/clients/anthropic", () => ({ generateRelatedKeywords: vi.fn() }));

vi.mock("@/lib/clients/youtube", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clients/youtube")>("@/lib/clients/youtube");
  return {
    ...actual,
    searchVideos: vi.fn(),
    listVideos: vi.fn(),
    listChannels: vi.fn(),
    listPopularVideos: vi.fn(),
  };
});

function searchItem(videoId: string) {
  return {
    id: { videoId },
    snippet: { title: "t", channelId: "c1", channelTitle: "ch", publishedAt: "2026-01-01T00:00:00Z", thumbnails: {} },
  };
}

function video(overrides: Partial<Awaited<ReturnType<typeof listVideos>>["items"][number]> = {}) {
  return {
    id: "v1",
    snippet: {
      title: "한국어 제목 영상",
      channelId: "c1",
      channelTitle: "채널",
      publishedAt: new Date().toISOString(),
    },
    statistics: { viewCount: "10000", likeCount: "100" },
    contentDetails: { duration: "PT1M" },
    ...overrides,
  } as Awaited<ReturnType<typeof listVideos>>["items"][number];
}

beforeEach(() => {
  vi.mocked(generateRelatedKeywords).mockResolvedValue([]);
});

afterEach(async () => {
  await prisma.apiCache.deleteMany({ where: { cacheKey: { startsWith: "explore-browse:" } } });
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

  it("빈 결과에도 topVideos/opportunityScore/relatedTopics 기본값을 포함한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [] });

    const result = await analyzeKeywordMarketability("존재하지않는키워드456");

    expect(result.topVideos).toEqual([]);
    expect(result.relatedTopics).toEqual([]);
    expect(result.opportunityScore.total).toBe(0);
  });

  it("상위 영상 리스트에 성능등급·VPH·추정수익·구독자수를 채워 반환한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({
      items: [{ id: { videoId: "v1" }, snippet: { title: "인기 영상 제목", channelId: "c1", channelTitle: "ch", publishedAt: "2026-01-01T00:00:00Z", thumbnails: {} } }],
    });
    vi.mocked(listVideos).mockResolvedValue({
      items: [
        {
          id: "v1",
          snippet: { title: "인기 영상 제목", channelId: "c1", channelTitle: "ch", publishedAt: new Date().toISOString(), tags: ["태그1"] },
          statistics: { viewCount: "500000", likeCount: "5000" },
          contentDetails: { duration: "PT1M" },
        },
      ],
    });
    vi.mocked(listChannels).mockResolvedValue({
      items: [
        {
          id: "c1",
          snippet: { title: "ch" },
          statistics: { subscriberCount: "5000" },
          contentDetails: { relatedPlaylists: { uploads: "u1" } },
        },
      ],
    });

    const result = await analyzeKeywordMarketability("테스트키워드2");

    expect(result.topVideos).toHaveLength(1);
    expect(result.topVideos[0]).toMatchObject({
      videoId: "v1",
      title: "인기 영상 제목",
      viewCount: 500000,
      channelSubscriberCount: 5000,
    });
    expect(result.topVideos[0].performanceTier).toBeDefined();
    expect(result.topVideos[0].vph).toBeGreaterThan(0);
    expect(result.relatedTopics.length).toBeGreaterThan(0);
    expect(result.opportunityScore.newChannelShare).toBe(100); // 구독자 5000 < 10만
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

describe("browseVideos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateRelatedKeywords).mockResolvedValue([]);
  });

  it("기간 24h + 쿼리·니치 없음이면 공식 인기 차트(listPopularVideos)를 사용한다", async () => {
    vi.mocked(listPopularVideos).mockResolvedValue({ items: [video()] });

    const result = await browseVideos({ regionCode: "KR", period: "24h", krOnly: false });

    expect(result.usedChart).toBe(true);
    expect(listPopularVideos).toHaveBeenCalled();
    expect(searchVideos).not.toHaveBeenCalled();
    expect(result.videos).toHaveLength(1);
  });

  it("기간이 24h가 아니면 search.list 기반으로 전환한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v1")] });
    vi.mocked(listVideos).mockResolvedValue({ items: [video()] });

    const result = await browseVideos({ regionCode: "KR", period: "7d", krOnly: false });

    expect(result.usedChart).toBe(false);
    expect(searchVideos).toHaveBeenCalled();
    expect(listPopularVideos).not.toHaveBeenCalled();
  });

  it("검색어가 있으면 24h여도 search.list 경로를 사용한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v1")] });
    vi.mocked(listVideos).mockResolvedValue({ items: [video()] });

    const result = await browseVideos({ regionCode: "KR", period: "24h", query: "다이어트", krOnly: false });

    expect(result.usedChart).toBe(false);
    expect(listPopularVideos).not.toHaveBeenCalled();
  });

  it("krOnly가 true면 한글 비중이 낮은 제목/채널명은 제외한다", async () => {
    vi.mocked(listPopularVideos).mockResolvedValue({
      items: [
        video({ id: "kr1", snippet: { title: "한국어 영상 제목", channelId: "c1", channelTitle: "한국채널", publishedAt: new Date().toISOString() } }),
        video({ id: "en1", snippet: { title: "English Only Title Here", channelId: "c2", channelTitle: "English Channel", publishedAt: new Date().toISOString() } }),
      ],
    });

    const result = await browseVideos({ period: "24h", krOnly: true });

    expect(result.videos.map((v) => v.id)).toEqual(["kr1"]);
  });

  it("videoForm=short이면 180초 초과 영상을 제외한다", async () => {
    vi.mocked(listPopularVideos).mockResolvedValue({
      items: [
        video({ id: "short1", contentDetails: { duration: "PT30S" } }),
        video({ id: "long1", contentDetails: { duration: "PT10M" } }),
      ],
    });

    const result = await browseVideos({ period: "24h", krOnly: false, videoForm: "short" });

    expect(result.videos.map((v) => v.id)).toEqual(["short1"]);
  });

  it("minViewFilter를 만족하지 못하는 영상은 제외한다", async () => {
    vi.mocked(listPopularVideos).mockResolvedValue({
      items: [
        video({ id: "big", statistics: { viewCount: "500000" } }),
        video({ id: "small", statistics: { viewCount: "100" } }),
      ],
    });

    const result = await browseVideos({ period: "24h", krOnly: false, minViewFilter: "10000" });

    expect(result.videos.map((v) => v.id)).toEqual(["big"]);
  });

  it("channelUniqueOnly면 채널당 조회수가 가장 높은 영상 1개만 남긴다", async () => {
    vi.mocked(listPopularVideos).mockResolvedValue({
      items: [
        video({ id: "c1-low", snippet: { title: "한국어 제목1", channelId: "same", channelTitle: "채널", publishedAt: new Date().toISOString() }, statistics: { viewCount: "1000" } }),
        video({ id: "c1-high", snippet: { title: "한국어 제목2", channelId: "same", channelTitle: "채널", publishedAt: new Date().toISOString() }, statistics: { viewCount: "9000" } }),
      ],
    });

    const result = await browseVideos({ period: "24h", krOnly: false, channelUniqueOnly: true });

    expect(result.videos).toHaveLength(1);
    expect(result.videos[0].id).toBe("c1-high");
  });

  it("니치 칩을 지정하면 니치 키워드로 병렬 검색하고 제목 매칭 필터를 적용한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v1"), searchItem("v2")] });
    vi.mocked(listVideos).mockResolvedValue({
      items: [
        video({ id: "v1", snippet: { title: "부동산 청약 꿀팁", channelId: "c1", channelTitle: "채널", publishedAt: new Date().toISOString() } }),
        video({ id: "v2", snippet: { title: "전혀 관련없는 브이로그", channelId: "c2", channelTitle: "채널2", publishedAt: new Date().toISOString() } }),
      ],
    });

    const result = await browseVideos({ period: "24h", krOnly: false, niche: "부동산" });

    expect(searchVideos).toHaveBeenCalled();
    expect(result.videos.map((v) => v.id)).toEqual(["v1"]);
  });

  it("성능 등급별 건수(tierCounts)와 핵심 토픽(topTopics)을 함께 반환한다", async () => {
    vi.mocked(listPopularVideos).mockResolvedValue({ items: [video()] });

    const result = await browseVideos({ period: "24h", krOnly: false });

    expect(result.tierCounts).toBeDefined();
    expect(Object.keys(result.tierCounts)).toEqual(
      expect.arrayContaining(["explosive", "rising", "steady_growth", "evergreen", "stagnant"]),
    );
    expect(Array.isArray(result.topTopics)).toBe(true);
  });
});

describe("analyzeKeywordsBulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateRelatedKeywords).mockResolvedValue([]);
  });

  it("최대 10개까지만 분석하고 videos 필드는 포함하지 않는다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [] });

    const keywords = Array.from({ length: 15 }, (_, i) => `키워드${i}`);
    const results = await analyzeKeywordsBulk(keywords);

    expect(results).toHaveLength(10);
    expect(results[0]).not.toHaveProperty("videos");
    expect(results[0]).not.toHaveProperty("topVideos");
    expect(results[0]).not.toHaveProperty("relatedTopics");
    expect(results[0].opportunityScore).toBeDefined();
    expect(results[0].keyword).toBe("키워드0");
  });
});

describe("suggestRelatedKeywords", () => {
  it("Anthropic 클라이언트의 연관 키워드 생성 함수를 그대로 호출한다", async () => {
    vi.mocked(generateRelatedKeywords).mockResolvedValue(["다이어트 식단", "다이어트 운동", "다이어트 간헐적단식"]);

    const result = await suggestRelatedKeywords("다이어트");

    expect(generateRelatedKeywords).toHaveBeenCalledWith("다이어트", 3);
    expect(result).toEqual(["다이어트 식단", "다이어트 운동", "다이어트 간헐적단식"]);
  });
});

describe("computeIdeaMarketScore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("키워드가 비어 있으면 검색 없이 0을 반환한다", async () => {
    const score = await computeIdeaMarketScore([]);
    expect(score).toBe(0);
    expect(searchVideos).not.toHaveBeenCalled();
  });

  it("검색 결과가 없으면 0을 반환한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [] });
    const score = await computeIdeaMarketScore(["게임중독", "실험"]);
    expect(score).toBe(0);
  });

  it("아이디어 고유 키워드로 검색해(니치 접두어 없이) VPH 기반 0~100 성과 점수를 산출한다", async () => {
    const now = new Date("2026-08-03T00:00:00.000Z");
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v1"), searchItem("v2")] });
    vi.mocked(listVideos).mockResolvedValue({
      items: [
        video({ id: "v1", snippet: { title: "t", channelId: "c1", channelTitle: "ch", publishedAt: dayAgo }, statistics: { viewCount: "48000" } }),
        video({ id: "v2", snippet: { title: "t", channelId: "c1", channelTitle: "ch", publishedAt: dayAgo }, statistics: { viewCount: "24000" } }),
      ],
    });

    const score = await computeIdeaMarketScore(["게임중독", "실험", "챌린지"], now);

    // 니치 접두어 없이 키워드만으로 검색하고, channels.list는 호출하지 않는다(VPH만 필요).
    expect(searchVideos).toHaveBeenCalledWith(expect.objectContaining({ q: "게임중독 실험 챌린지", regionCode: "KR" }));
    expect(listChannels).not.toHaveBeenCalled();
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("VPH가 높은 주제일수록 더 높은 점수를 준다", async () => {
    const now = new Date("2026-08-03T00:00:00.000Z");
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v1")] });
    vi.mocked(listVideos).mockResolvedValue({
      items: [video({ id: "v1", snippet: { title: "t", channelId: "c1", channelTitle: "ch", publishedAt: dayAgo }, statistics: { viewCount: "240000" } })],
    });
    const hot = await computeIdeaMarketScore(["핫한주제"], now);

    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v2")] });
    vi.mocked(listVideos).mockResolvedValue({
      items: [video({ id: "v2", snippet: { title: "t", channelId: "c1", channelTitle: "ch", publishedAt: dayAgo }, statistics: { viewCount: "240" } })],
    });
    const cold = await computeIdeaMarketScore(["잔잔한주제"], now);

    expect(hot).toBeGreaterThan(cold);
  });
});

describe("getNicheTopPerformers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("검색 결과가 없으면 빈 배열을 반환한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [] });
    const result = await getNicheTopPerformers("부동산");
    expect(result).toEqual([]);
    expect(listVideos).not.toHaveBeenCalled();
  });

  it("니치를 검색해 VPH(시간당 조회수) 높은 순으로 상위 N개를 반환한다", async () => {
    const now = new Date("2026-08-03T00:00:00.000Z");
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v1"), searchItem("v2")] });
    vi.mocked(listVideos).mockResolvedValue({
      items: [
        video({ id: "v1", snippet: { title: "낮은 VPH", channelId: "c1", channelTitle: "ch", publishedAt: dayAgo }, statistics: { viewCount: "2400" } }),
        video({ id: "v2", snippet: { title: "높은 VPH", channelId: "c1", channelTitle: "ch", publishedAt: dayAgo }, statistics: { viewCount: "24000" } }),
      ],
    });

    const result = await getNicheTopPerformers("이슈·정치 시사", 5, now);

    expect(searchVideos).toHaveBeenCalledWith(expect.objectContaining({ q: "이슈·정치 시사", regionCode: "KR" }));
    expect(result[0].title).toBe("높은 VPH"); // VPH 내림차순
    expect(result[0].niche).toBe("이슈·정치 시사");
    expect(result[0].vph).toBeGreaterThan(result[1].vph);
  });

  it("count로 상위 개수를 제한한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v1"), searchItem("v2"), searchItem("v3")] });
    vi.mocked(listVideos).mockResolvedValue({
      items: [video({ id: "v1" }), video({ id: "v2" }), video({ id: "v3" })],
    });

    const result = await getNicheTopPerformers("부동산", 2);
    expect(result).toHaveLength(2);
  });
});
