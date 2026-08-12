import { beforeEach, describe, expect, it, vi } from "vitest";

import { getChannel, listPlaylistItems, listVideos, searchChannels } from "@/lib/clients/youtube";
import { resolveChannel, scanChannel } from "@/server/services/channel-analysis.service";

vi.mock("@/lib/clients/youtube", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clients/youtube")>("@/lib/clients/youtube");
  return {
    ...actual,
    getChannel: vi.fn(),
    searchChannels: vi.fn(),
    listPlaylistItems: vi.fn(),
    listVideos: vi.fn(),
  };
});

function fakeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: "UC123",
    snippet: { title: "테스트 채널" },
    statistics: { subscriberCount: "1000", videoCount: "3", viewCount: "50000" },
    contentDetails: { relatedPlaylists: { uploads: "UUplaylist" } },
    ...overrides,
  };
}

describe("resolveChannel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("채널 ID 입력이면 id 파라미터로 조회한다", async () => {
    vi.mocked(getChannel).mockResolvedValue({ items: [fakeChannel()] });
    const id = "UC" + "a".repeat(22);

    const result = await resolveChannel(id);

    expect(getChannel).toHaveBeenCalledWith({ id });
    expect(result?.id).toBe("UC123");
  });

  it("핸들 입력이면 forHandle 파라미터로 조회한다", async () => {
    vi.mocked(getChannel).mockResolvedValue({ items: [fakeChannel()] });

    await resolveChannel("@veritasium");

    expect(getChannel).toHaveBeenCalledWith({ forHandle: "@veritasium" });
  });

  it("일반 검색어면 채널 검색 후 첫 결과의 id로 재조회한다", async () => {
    vi.mocked(searchChannels).mockResolvedValue({ items: [{ id: { channelId: "UCfound" }, snippet: { title: "찾음" } }] });
    vi.mocked(getChannel).mockResolvedValue({ items: [fakeChannel({ id: "UCfound" })] });

    const result = await resolveChannel("먹방 채널");

    expect(searchChannels).toHaveBeenCalledWith("먹방 채널");
    expect(getChannel).toHaveBeenCalledWith({ id: "UCfound" });
    expect(result?.id).toBe("UCfound");
  });

  it("검색 결과가 없으면 null을 반환한다", async () => {
    vi.mocked(searchChannels).mockResolvedValue({ items: [] });

    const result = await resolveChannel("존재하지않음");

    expect(result).toBeNull();
    expect(getChannel).not.toHaveBeenCalled();
  });
});

describe("scanChannel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("채널을 찾지 못하면 에러를 던진다", async () => {
    vi.mocked(getChannel).mockResolvedValue({ items: [] });

    await expect(scanChannel("UC" + "z".repeat(22))).rejects.toThrow("채널을 찾을 수 없습니다.");
  });

  it("uploads 플레이리스트를 페이지네이션으로 수집하고 videos.list로 통계를 조회한다", async () => {
    vi.mocked(getChannel).mockResolvedValue({ items: [fakeChannel()] });
    vi.mocked(listPlaylistItems)
      .mockResolvedValueOnce({
        items: [{ contentDetails: { videoId: "v1" } }, { contentDetails: { videoId: "v2" } }],
        nextPageToken: "page2",
      })
      .mockResolvedValueOnce({ items: [{ contentDetails: { videoId: "v3" } }] });
    vi.mocked(listVideos).mockResolvedValue({
      items: ["v1", "v2", "v3"].map((id) => ({
        id,
        snippet: { title: id, channelId: "UC123", channelTitle: "c", publishedAt: "2026-01-01T00:00:00Z" },
        statistics: { viewCount: "100", likeCount: "1" },
      })),
    });

    const report = await scanChannel("UC" + "1".repeat(22));

    expect(listPlaylistItems).toHaveBeenCalledTimes(2);
    expect(listPlaylistItems).toHaveBeenNthCalledWith(1, "UUplaylist", undefined);
    expect(listPlaylistItems).toHaveBeenNthCalledWith(2, "UUplaylist", "page2");
    expect(listVideos).toHaveBeenCalledWith(["v1", "v2", "v3"]);
    expect(report.scannedCount).toBe(3);
    expect(report.analysis.videoCount).toBe(3);
    expect(report.period).toBe("10d"); // 기본값
  });

  it("기간(period)을 넘기면 컷오프보다 오래된 업로드를 만나는 즉시 스캔을 멈춘다", async () => {
    const nowIso = new Date().toISOString();
    const oldIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30일 전

    vi.mocked(getChannel).mockResolvedValue({ items: [fakeChannel()] });
    vi.mocked(listPlaylistItems).mockResolvedValueOnce({
      items: [
        { contentDetails: { videoId: "v1", videoPublishedAt: nowIso } },
        { contentDetails: { videoId: "v2", videoPublishedAt: nowIso } },
        { contentDetails: { videoId: "v3", videoPublishedAt: oldIso } }, // 7일 컷오프 밖 → 여기서 멈춤
      ],
      nextPageToken: "page2",
    });
    vi.mocked(listVideos).mockResolvedValue({
      items: ["v1", "v2"].map((id) => ({
        id,
        snippet: { title: id, channelId: "UC123", channelTitle: "c", publishedAt: nowIso },
        statistics: { viewCount: "100" },
      })),
    });

    const report = await scanChannel("UC" + "1".repeat(22), "7d");

    // v3(30일 전)에서 멈췄으므로 v1,v2만 수집하고 다음 페이지는 요청하지 않는다.
    expect(listPlaylistItems).toHaveBeenCalledTimes(1);
    expect(listVideos).toHaveBeenCalledWith(["v1", "v2"]);
    expect(report.scannedCount).toBe(2);
    expect(report.period).toBe("7d");
  });
});
