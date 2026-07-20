import { beforeEach, describe, expect, it, vi } from "vitest";

import { listChannels, listPlaylistItems, listVideos, searchVideos } from "@/lib/clients/youtube";
import { findSurgedVideos } from "@/server/services/surge.service";

vi.mock("@/lib/clients/youtube", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clients/youtube")>("@/lib/clients/youtube");
  return {
    ...actual,
    searchVideos: vi.fn(),
    listVideos: vi.fn(),
    listChannels: vi.fn(),
    listPlaylistItems: vi.fn(),
  };
});

function searchItem(videoId: string) {
  return {
    id: { videoId },
    snippet: { title: "t", channelId: "c1", channelTitle: "ch", publishedAt: "2026-01-01T00:00:00Z", thumbnails: {} },
  };
}

function videoStat(id: string, viewCount: string, channelId = "c1") {
  return {
    id,
    snippet: { title: `title-${id}`, channelId, channelTitle: "ch", publishedAt: "2026-01-01T00:00:00Z" },
    statistics: { viewCount, likeCount: "0" },
  };
}

describe("findSurgedVideos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("검색 결과가 없으면 빈 결과를 반환하고 이후 API를 호출하지 않는다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [] });

    const result = await findSurgedVideos({ keyword: "없는키워드" });

    expect(result.videos).toEqual([]);
    expect(listVideos).not.toHaveBeenCalled();
    expect(listChannels).not.toHaveBeenCalled();
  });

  it("채널 median 대비 threshold 이상 폭증한 영상만 반환한다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v1")] });
    vi.mocked(listVideos)
      .mockResolvedValueOnce({ items: [videoStat("v1", "50000", "c1")] }) // 후보 영상 조회
      .mockResolvedValueOnce({
        items: Array.from({ length: 5 }, (_, i) => videoStat(`base${i}`, "1000", "c1")),
      }); // baseline 조회
    vi.mocked(listChannels).mockResolvedValue({
      items: [
        {
          id: "c1",
          snippet: { title: "ch" },
          statistics: { subscriberCount: "1000" },
          contentDetails: { relatedPlaylists: { uploads: "UUplaylist" } },
        },
      ],
    });
    vi.mocked(listPlaylistItems).mockResolvedValue({
      items: Array.from({ length: 5 }, (_, i) => ({ contentDetails: { videoId: `base${i}` } })),
    });

    const result = await findSurgedVideos({ keyword: "테스트", threshold: 5 });

    expect(result.videos).toHaveLength(1);
    expect(result.videos[0].videoId).toBe("v1");
    expect(result.videos[0].ratio).toBe(50);
    expect(result.candidateCount).toBe(1);
  });

  it("baseline 표본이 부족한 채널은 결과에서 제외된다", async () => {
    vi.mocked(searchVideos).mockResolvedValue({ items: [searchItem("v1")] });
    vi.mocked(listVideos)
      .mockResolvedValueOnce({ items: [videoStat("v1", "50000", "c1")] })
      .mockResolvedValueOnce({ items: [videoStat("base0", "1000", "c1")] }); // 표본 1개뿐
    vi.mocked(listChannels).mockResolvedValue({
      items: [
        {
          id: "c1",
          snippet: { title: "ch" },
          statistics: { subscriberCount: "1000" },
          contentDetails: { relatedPlaylists: { uploads: "UUplaylist" } },
        },
      ],
    });
    vi.mocked(listPlaylistItems).mockResolvedValue({ items: [{ contentDetails: { videoId: "base0" } }] });

    const result = await findSurgedVideos({ keyword: "테스트" });

    expect(result.videos).toEqual([]);
  });
});
