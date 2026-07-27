import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { analyzeSurgePatterns, generateRelatedKeywords } from "@/lib/clients/anthropic";
import { listChannels, listPlaylistItems, listPopularVideos, listVideos, searchVideos } from "@/lib/clients/youtube";
import { prisma } from "@/lib/prisma";
import {
  analyzeSurgePatternsForVideos,
  findSurgedVideos,
  findSurgedVideosByCategory,
  findSurgedVideosForChannel,
} from "@/server/services/surge.service";

vi.mock("@/lib/clients/anthropic", () => ({
  generateRelatedKeywords: vi.fn(),
  analyzeSurgePatterns: vi.fn(),
}));

vi.mock("@/lib/clients/youtube", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clients/youtube")>("@/lib/clients/youtube");
  return {
    ...actual,
    searchVideos: vi.fn(),
    listVideos: vi.fn(),
    listChannels: vi.fn(),
    listPlaylistItems: vi.fn(),
    listPopularVideos: vi.fn(),
  };
});

function searchItem(videoId: string, channelId = "c1") {
  return {
    id: { videoId },
    snippet: { title: "t", channelId, channelTitle: "ch", publishedAt: "2026-01-01T00:00:00Z", thumbnails: {} },
  };
}

function videoStat(id: string, viewCount: string, channelId = "c1", publishedAt = "2026-01-01T00:00:00Z") {
  return {
    id,
    snippet: { title: `title-${id}`, channelId, channelTitle: "ch", publishedAt },
    statistics: { viewCount, likeCount: "0" },
    contentDetails: { duration: "PT1M" },
  };
}

function channel(id: string, overrides: Partial<{ subscriberCount: string; hiddenSubscriberCount: boolean; uploadsPlaylistId: string }> = {}) {
  return {
    id,
    snippet: { title: "ch" },
    statistics: { subscriberCount: overrides.subscriberCount ?? "1000", hiddenSubscriberCount: overrides.hiddenSubscriberCount },
    contentDetails: { relatedPlaylists: { uploads: overrides.uploadsPlaylistId ?? `UU-${id}` } },
  };
}

function baselinePlaylistItems(count = 5, prefix = "base") {
  return { items: Array.from({ length: count }, (_, i) => ({ contentDetails: { videoId: `${prefix}${i}` } })) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(generateRelatedKeywords).mockResolvedValue([]);
});

afterEach(async () => {
  await prisma.apiCache.deleteMany({ where: { cacheKey: { startsWith: "surge-" } } });
});

describe("findSurgedVideos (영상 단위/키워드 모드)", () => {
  it("검색 결과가 없으면 빈 결과를 반환하고 이후 API를 호출하지 않는다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [] });

    const result = await findSurgedVideos({ keyword: "없는키워드" });

    expect(result.videos).toEqual([]);
    expect(result.mode).toBe("keyword");
    expect(listVideos).not.toHaveBeenCalled();
    expect(listChannels).not.toHaveBeenCalled();
  });

  it("채널 median 대비 threshold 이상 폭증한 영상만 반환한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v1")] });
    vi.mocked(listVideos)
      .mockResolvedValueOnce({ items: [videoStat("v1", "50000", "c1")] })
      .mockResolvedValueOnce({ items: Array.from({ length: 5 }, (_, i) => videoStat(`base${i}`, "1000", "c1")) });
    vi.mocked(listChannels).mockResolvedValue({ items: [channel("c1")] });
    vi.mocked(listPlaylistItems).mockResolvedValue(baselinePlaylistItems(5));

    const result = await findSurgedVideos({ keyword: "테스트고유키워드1", threshold: 5 });

    expect(result.videos).toHaveLength(1);
    expect(result.videos[0].videoId).toBe("v1");
    expect(result.videos[0].ratio).toBe(50);
    expect(result.candidateCount).toBe(1);
  });

  it("baseline 표본이 부족한 채널은 결과에서 제외된다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v1")] });
    vi.mocked(listVideos)
      .mockResolvedValueOnce({ items: [videoStat("v1", "50000", "c1")] })
      .mockResolvedValueOnce({ items: [videoStat("base0", "1000", "c1")] });
    vi.mocked(listChannels).mockResolvedValue({ items: [channel("c1")] });
    vi.mocked(listPlaylistItems).mockResolvedValue(baselinePlaylistItems(1));

    const result = await findSurgedVideos({ keyword: "테스트고유키워드2" });

    expect(result.videos).toEqual([]);
  });

  it("숨겨진 보석 모드에서 구독자 상한 초과 채널은 제외된다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v1")] });
    vi.mocked(listVideos)
      .mockResolvedValueOnce({ items: [videoStat("v1", "50000", "c1")] })
      .mockResolvedValueOnce({ items: Array.from({ length: 5 }, (_, i) => videoStat(`base${i}`, "1000", "c1")) });
    vi.mocked(listChannels).mockResolvedValue({ items: [channel("c1", { subscriberCount: "200000" })] });
    vi.mocked(listPlaylistItems).mockResolvedValue(baselinePlaylistItems(5));

    const result = await findSurgedVideos({
      keyword: "테스트고유키워드3",
      threshold: 5,
      hiddenGem: { enabled: true, subscriberCap: 100_000 },
    });

    expect(result.videos).toEqual([]);
  });
});

describe("findSurgedVideosByCategory (채널 단위/카테고리 모드)", () => {
  it("시드 키워드가 없으면 공식 인기 차트 기반으로 채널을 선정한다", async () => {
    vi.mocked(listPopularVideos).mockResolvedValue({
      items: [videoStat("p1", "1000000", "c1"), videoStat("p2", "900000", "c2")],
    });
    vi.mocked(listChannels).mockResolvedValue({ items: [channel("c1"), channel("c2")] });
    vi.mocked(listPlaylistItems).mockImplementation((playlistId: string) =>
      Promise.resolve(baselinePlaylistItems(5, playlistId)),
    );
    vi.mocked(listVideos).mockImplementation((ids: string[]) =>
      Promise.resolve({ items: ids.map((id) => videoStat(id, "1000", id.includes("UU-c1") ? "c1" : "c2")) }),
    );

    const result = await findSurgedVideosByCategory({ regionCode: "KR", categoryId: "20" });

    expect(listPopularVideos).toHaveBeenCalledWith(expect.objectContaining({ regionCode: "KR", categoryId: "20" }));
    expect(result.mode).toBe("category");
  });

  it("시드 키워드가 있으면 search.list로 채널을 선정한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v1", "c1")] });
    vi.mocked(listChannels).mockResolvedValue({ items: [channel("c1")] });
    vi.mocked(listPlaylistItems).mockResolvedValue(baselinePlaylistItems(5));
    vi.mocked(listVideos).mockResolvedValue({
      items: Array.from({ length: 5 }, (_, i) => videoStat(`base${i}`, "1000", "c1")),
    });

    const result = await findSurgedVideosByCategory({ regionCode: "KR", seedKeyword: "고유시드키워드" });

    expect(searchVideos).toHaveBeenCalled();
    expect(listPopularVideos).not.toHaveBeenCalled();
    expect(result.mode).toBe("category");
  });

  it("채널이 없으면 빈 결과를 반환한다", async () => {
    vi.mocked(listPopularVideos).mockResolvedValue({ items: [] });

    const result = await findSurgedVideosByCategory({ regionCode: "KR", categoryId: "존재안함카테고리" });

    expect(result.videos).toEqual([]);
    expect(listChannels).not.toHaveBeenCalled();
  });
});

describe("findSurgedVideosForChannel (채널 ID 모드)", () => {
  it("채널을 찾지 못하면 빈 결과를 반환한다", async () => {
    vi.mocked(listChannels).mockResolvedValue({ items: [] });

    const result = await findSurgedVideosForChannel({ channelId: "UC없는채널아이디" });

    expect(result.videos).toEqual([]);
    expect(result.mode).toBe("channel");
  });

  it("채널의 최근 업로드 중 median 대비 폭증한 영상만 반환한다", async () => {
    vi.mocked(listChannels).mockResolvedValue({ items: [channel("target채널")] });
    vi.mocked(listPlaylistItems).mockResolvedValue({
      items: [
        { contentDetails: { videoId: "hit1" } },
        ...Array.from({ length: 4 }, (_, i) => ({ contentDetails: { videoId: `base${i}` } })),
      ],
    });
    vi.mocked(listVideos).mockResolvedValue({
      items: [
        videoStat("hit1", "20000", "target채널"),
        ...Array.from({ length: 4 }, (_, i) => videoStat(`base${i}`, "1000", "target채널")),
      ],
    });

    const result = await findSurgedVideosForChannel({ channelId: "target채널", threshold: 5 });

    expect(result.videos.map((v) => v.videoId)).toEqual(["hit1"]);
  });
});

describe("analyzeSurgePatternsForVideos", () => {
  it("SurgedVideo 배열을 패턴 분석 입력 형식으로 변환해 호출한다", async () => {
    vi.mocked(analyzeSurgePatterns).mockResolvedValue({
      commonHooks: ["훅1"],
      uploadTimePattern: "저녁",
      lengthPattern: "짧음",
      topicPattern: "공통주제",
      summary: "요약",
    });

    const result = await analyzeSurgePatternsForVideos([
      {
        videoId: "v1",
        title: "제목",
        channelId: "c1",
        channelTitle: "채널",
        viewCount: 1000,
        publishedAt: "2026-01-01T00:00:00Z",
        ratio: 10,
        channelMedianViewCount: 100,
        isRisingStar: false,
        durationSeconds: 30,
      },
    ]);

    expect(analyzeSurgePatterns).toHaveBeenCalledWith([
      { title: "제목", publishedAt: "2026-01-01T00:00:00Z", durationSeconds: 30, ratio: 10 },
    ]);
    expect(result.summary).toBe("요약");
  });
});
