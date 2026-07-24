import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateScriptPattern, generateVideoIdeas } from "@/lib/clients/anthropic";
import { getChannel } from "@/lib/clients/youtube";
import {
  generateIdeasForVideo,
  generateScriptPatternForVideo,
  getVideoAnalysisDetail,
} from "@/server/services/video-analysis.service";
import { analyzeVideoSeo } from "@/server/services/video-seo.service";

vi.mock("@/lib/clients/anthropic", () => ({ generateVideoIdeas: vi.fn(), generateScriptPattern: vi.fn() }));

vi.mock("@/lib/clients/youtube", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clients/youtube")>("@/lib/clients/youtube");
  return { ...actual, getChannel: vi.fn() };
});

vi.mock("@/server/services/video-seo.service", () => ({ analyzeVideoSeo: vi.fn() }));

function fakeReport() {
  return {
    video: {
      id: "v1",
      title: "제목",
      channelId: "c1",
      channelTitle: "채널",
      description: "설명",
      tags: [],
      viewCount: 100,
      likeCount: 10,
      commentCount: 5,
      duration: "PT1M",
      publishedAt: "2026-01-01T00:00:00Z",
      isShort: true,
    },
    seo: { total: 50, mode: "general" as const, items: [], bestPractices: [], suggestions: [] },
    comments: { summary: null, frequentQuestions: [], insight: null, sampleSize: 0 },
    performance: { vph: 0, tier: "stagnant" as const, estimatedRevenueKrw: 0 },
    chapters: [],
    similarVideos: [],
    similarVideosSearchTerm: "제목",
    sameChannelVideos: [],
  };
}

describe("getVideoAnalysisDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("채널 정보를 함께 조회해 결과에 포함한다", async () => {
    vi.mocked(analyzeVideoSeo).mockResolvedValue(fakeReport());
    vi.mocked(getChannel).mockResolvedValue({
      items: [
        {
          id: "c1",
          snippet: { title: "채널" },
          statistics: { subscriberCount: "1000", videoCount: "50", viewCount: "20000" },
          contentDetails: { relatedPlaylists: { uploads: "UU1" } },
        },
      ],
    });

    const result = await getVideoAnalysisDetail("v1");

    expect(result.channel).toEqual({ title: "채널", subscriberCount: 1000, videoCount: 50, viewCount: 20000 });
  });

  it("채널 조회가 실패해도 나머지 결과는 반환한다", async () => {
    vi.mocked(analyzeVideoSeo).mockResolvedValue(fakeReport());
    vi.mocked(getChannel).mockRejectedValue(new Error("실패"));

    const result = await getVideoAnalysisDetail("v1");

    expect(result.channel).toBeNull();
    expect(result.video.id).toBe("v1");
  });
});

describe("generateIdeasForVideo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("전달받은 컨텍스트로 바로 아이디어 생성 API를 호출한다 (재조회 없음)", async () => {
    vi.mocked(generateVideoIdeas).mockResolvedValue({
      ideas: Array.from({ length: 5 }, (_, i) => ({
        title: `아이디어${i}`,
        hook: "훅",
        differentiator: "차별화",
        keywords: [],
      })),
    });

    const result = await generateIdeasForVideo({ title: "제목", description: "설명" });

    expect(generateVideoIdeas).toHaveBeenCalledWith({ title: "제목", description: "설명" });
    expect(result.ideas).toHaveLength(5);
    expect(analyzeVideoSeo).not.toHaveBeenCalled();
  });
});

describe("generateScriptPatternForVideo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("전달받은 컨텍스트로 바로 대본 패턴 생성 API를 호출한다", async () => {
    vi.mocked(generateScriptPattern).mockResolvedValue({
      title: "새 제목",
      hook: "후킹",
      body: "본문",
      imagePrompts: ["prompt1"],
    });

    const result = await generateScriptPatternForVideo({ title: "제목", description: "설명" });

    expect(generateScriptPattern).toHaveBeenCalledWith({ title: "제목", description: "설명" });
    expect(result.title).toBe("새 제목");
  });
});
