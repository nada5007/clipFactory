import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildOAuthAuthorizationUrl, listPopularVideos, searchVideos, uploadVideo } from "@/lib/clients/youtube";
import { prisma } from "@/lib/prisma";

// getTodayQuotaUsage()는 오늘자 전체 엔드포인트 합계를 조회하므로(실제 대시보드 용도),
// 다른 테스트 파일이 병렬로 같은 날짜에 쿼터를 기록하면 경합이 생긴다.
// 이 파일에서만 쓰는 "youtube.search.list" 엔드포인트로 직접 집계해 그 경합을 피한다.
async function getSearchQuotaUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const result = await prisma.quotaUsage.aggregate({
    where: { endpoint: "youtube.search.list", date: today },
    _sum: { cost: true },
  });
  return result._sum.cost ?? 0;
}

const mockSearchResponse = {
  items: [
    {
      id: { videoId: "abc123" },
      snippet: {
        title: "테스트 영상",
        channelId: "chan1",
        channelTitle: "테스트 채널",
        publishedAt: "2026-01-01T00:00:00Z",
        thumbnails: {},
      },
    },
  ],
};

describe("youtube client", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockSearchResponse,
        text: async () => "",
      }),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await prisma.apiCache.deleteMany({ where: { cacheKey: { startsWith: "youtube:search:" } } });
    await prisma.quotaUsage.deleteMany({ where: { endpoint: "youtube.search.list" } });
  });

  it("검색 결과를 가져오고 쿼터(100 units)를 기록한다", async () => {
    const before = await getSearchQuotaUsage();

    const result = await searchVideos({ q: `테스트쿼리-${Date.now()}` });

    expect(result.items[0].snippet.title).toBe("테스트 영상");
    expect(fetch).toHaveBeenCalledTimes(1);

    const after = await getSearchQuotaUsage();
    expect(after - before).toBe(100);
  });

  it("동일 파라미터로 재호출하면 캐시를 사용하고 fetch/쿼터를 다시 소비하지 않는다", async () => {
    const query = `캐시테스트-${Date.now()}`;

    await searchVideos({ q: query });
    const before = await getSearchQuotaUsage();
    await searchVideos({ q: query });
    const after = await getSearchQuotaUsage();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(after - before).toBe(0);
  });
});

describe("listPopularVideos", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
        text: async () => "",
      }),
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await prisma.apiCache.deleteMany({ where: { cacheKey: { startsWith: "youtube:videos:" } } });
  });

  it("chart=mostPopular와 기본 지역(KR)으로 요청한다", async () => {
    await listPopularVideos({});

    const [url] = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls[0];
    expect(url).toContain("chart=mostPopular");
    expect(url).toContain("regionCode=KR");
  });

  it("regionCode/categoryId를 지정하면 그대로 반영한다", async () => {
    await listPopularVideos({ regionCode: "US", categoryId: "20", maxResults: 10 });

    const [url] = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls[0];
    expect(url).toContain("regionCode=US");
    expect(url).toContain("videoCategoryId=20");
    expect(url).toContain("maxResults=10");
  });
});

describe("buildOAuthAuthorizationUrl", () => {
  it("필수 OAuth 파라미터(scope, redirect_uri, state)를 포함한 Google 인증 URL을 만든다", () => {
    const url = buildOAuthAuthorizationUrl("http://localhost:3000/api/channels/c1/oauth/callback", "c1");

    expect(url).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/channels/c1/oauth/callback",
    );
    expect(parsed.searchParams.get("state")).toBe("c1");
    expect(parsed.searchParams.get("scope")).toContain("youtube.upload");
    expect(parsed.searchParams.get("scope")).toContain("youtube.readonly");
    expect(parsed.searchParams.get("access_type")).toBe("offline");
  });
});

describe("uploadVideo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("multipart/related 본문으로 videos.insert를 호출하고 videoId를 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "video-123" }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadVideo(
      "access-token",
      { title: "제목", description: "설명", tags: ["a", "b"], privacyStatus: "private" },
      Buffer.from("fake-video-bytes"),
    );

    expect(result).toEqual({ videoId: "video-123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("uploadType=multipart");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer access-token");
    expect(options.headers["Content-Type"]).toMatch(/^multipart\/related; boundary=/);

    const bodyText = Buffer.from(options.body).toString("utf-8");
    expect(bodyText).toContain('"title":"제목"');
    expect(bodyText).toContain("fake-video-bytes");
  });
});
