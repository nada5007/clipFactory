import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { generateDailyIdeas } from "@/lib/clients/anthropic";
import { listPopularVideos } from "@/lib/clients/youtube";
import { prisma } from "@/lib/prisma";
import { generateTodayIdeas, getTodayIdeas, todayDateString } from "@/server/services/daily-idea.service";
import { computeIdeaMarketScore, getNicheTopPerformers } from "@/server/services/explore.service";
import { listNiches, setNiches } from "@/server/services/niche.service";

vi.mock("@/lib/clients/anthropic", () => ({ generateDailyIdeas: vi.fn() }));

vi.mock("@/lib/clients/youtube", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clients/youtube")>("@/lib/clients/youtube");
  return { ...actual, listPopularVideos: vi.fn() };
});

// 실제 성과 점수·니치 상위 성과 수집은 YouTube 검색을 타므로 서비스 경계에서 모킹한다(네트워크 배제·결정론).
vi.mock("@/server/services/explore.service", () => ({
  computeIdeaMarketScore: vi.fn().mockResolvedValue(50),
  getNicheTopPerformers: vi.fn().mockResolvedValue([]),
}));

function fakeIdeas(seed: string, niche = "") {
  return Array.from({ length: 5 }, (_, i) => ({
    title: `${seed}-${i}`,
    niche,
    recommendScore: 80,
    whyGood: "이유",
    hook: "훅",
    differentiator: "차별화",
    keywords: ["a"],
  }));
}

describe("daily-idea.service", () => {
  const NOW = new Date("2026-03-01T00:00:00.000Z");
  const TEST_DATE = todayDateString(NOW);
  let originalNiches: string[] = [];

  // DailyIdea/NicheSetting은 전역 테이블이라 실제 오늘자 아이디어·니치 설정이 들어있을 수 있다.
  // 고정된 과거 테스트 날짜(TEST_DATE)의 레코드만 지우고, 니치는 스냅샷 후 복원해 실제 데이터를 보존한다.
  beforeAll(async () => {
    originalNiches = await listNiches();
  });

  afterAll(async () => {
    await setNiches(originalNiches);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(computeIdeaMarketScore).mockResolvedValue(50);
    vi.mocked(getNicheTopPerformers).mockResolvedValue([]);
  });
  afterEach(async () => {
    await prisma.dailyIdea.deleteMany({ where: { date: TEST_DATE } });
  });

  it("오늘 아이디어가 없으면 null을 반환한다", async () => {
    expect(await getTodayIdeas("auto", NOW)).toBeNull();
  });

  it("auto 모드는 설정된 니치와 인기 영상 제목을 컨텍스트로 넘기고 결과를 오늘 날짜로 저장한다", async () => {
    await setNiches(["부동산"]);
    vi.mocked(listPopularVideos).mockResolvedValue({
      items: [{ id: "v1", snippet: { title: "인기영상제목", channelId: "c", channelTitle: "ch", publishedAt: "2026-01-01T00:00:00Z" }, statistics: {} }],
    });
    vi.mocked(generateDailyIdeas).mockResolvedValue(fakeIdeas("auto"));

    const result = await generateTodayIdeas({ mode: "auto" }, NOW);

    expect(generateDailyIdeas).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "auto", niches: ["부동산"], trendTitles: ["인기영상제목"] }),
    );
    expect(result.date).toBe(todayDateString(NOW));
    expect((result.ideasJson as unknown[]).length).toBe(5);

    const stored = await getTodayIdeas("auto", NOW);
    expect(stored?.id).toBe(result.id);
  });

  it("각 아이디어에 실제 성과 점수(marketScore)를 계산해 함께 저장한다", async () => {
    vi.mocked(listPopularVideos).mockResolvedValue({ items: [] });
    vi.mocked(generateDailyIdeas).mockResolvedValue(fakeIdeas("scored"));
    vi.mocked(computeIdeaMarketScore).mockResolvedValue(73);

    const result = await generateTodayIdeas({ mode: "auto" }, NOW);

    expect(computeIdeaMarketScore).toHaveBeenCalledTimes(5);
    const ideas = result.ideasJson as { marketScore: number; recommendScore: number }[];
    expect(ideas.every((i) => i.marketScore === 73)).toBe(true);
    expect(ideas.every((i) => i.recommendScore === 80)).toBe(true);
  });

  it("각 니치의 실제 상위 성과 영상을 모아 생성 프롬프트에 근거로 넘긴다(생성 그라운딩)", async () => {
    await setNiches(["이슈·정치 시사", "쇼츠·밈"]);
    vi.mocked(listPopularVideos).mockResolvedValue({ items: [] });
    vi.mocked(getNicheTopPerformers).mockImplementation(async (niche: string) => [
      { niche, title: `${niche} 상위영상`, viewCount: 100000, vph: 500 },
    ]);
    vi.mocked(generateDailyIdeas).mockResolvedValue(fakeIdeas("grounded", "이슈·정치 시사"));

    await generateTodayIdeas({ mode: "auto" }, NOW);

    expect(getNicheTopPerformers).toHaveBeenCalledWith("이슈·정치 시사", 5, NOW);
    expect(getNicheTopPerformers).toHaveBeenCalledWith("쇼츠·밈", 5, NOW);
    expect(generateDailyIdeas).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "auto",
        nichePerformers: [
          { niche: "이슈·정치 시사", title: "이슈·정치 시사 상위영상", viewCount: 100000, vph: 500 },
          { niche: "쇼츠·밈", title: "쇼츠·밈 상위영상", viewCount: 100000, vph: 500 },
        ],
      }),
    );
  });

  it("marketScore 계산 시 아이디어의 소속 니치를 검색 문맥으로 넘긴다(니치 범위 성과)", async () => {
    vi.mocked(listPopularVideos).mockResolvedValue({ items: [] });
    vi.mocked(generateDailyIdeas).mockResolvedValue(fakeIdeas("scoped", "이슈·정치 시사"));

    await generateTodayIdeas({ mode: "auto" }, NOW);

    expect(computeIdeaMarketScore).toHaveBeenCalledWith(["a"], "이슈·정치 시사");
  });

  it("한 니치의 상위 성과 수집이 실패해도 생성은 계속된다", async () => {
    await setNiches(["니치A", "니치B"]);
    vi.mocked(listPopularVideos).mockResolvedValue({ items: [] });
    vi.mocked(getNicheTopPerformers)
      .mockRejectedValueOnce(new Error("쿼터 초과"))
      .mockResolvedValue([{ niche: "니치B", title: "B 상위", viewCount: 1, vph: 1 }]);
    vi.mocked(generateDailyIdeas).mockResolvedValue(fakeIdeas("resilient", "니치B"));

    const result = await generateTodayIdeas({ mode: "auto" }, NOW);

    expect(result).toBeDefined();
    expect(generateDailyIdeas).toHaveBeenCalledWith(
      expect.objectContaining({ nichePerformers: [{ niche: "니치B", title: "B 상위", viewCount: 1, vph: 1 }] }),
    );
  });

  it("marketScore 계산이 실패한 아이디어는 0으로 저장되고 나머지 생성은 계속된다", async () => {
    vi.mocked(listPopularVideos).mockResolvedValue({ items: [] });
    vi.mocked(generateDailyIdeas).mockResolvedValue(fakeIdeas("fail"));
    vi.mocked(computeIdeaMarketScore)
      .mockRejectedValueOnce(new Error("쿼터 초과"))
      .mockResolvedValue(60);

    const result = await generateTodayIdeas({ mode: "auto" }, NOW);

    const scores = (result.ideasJson as { marketScore: number }[]).map((i) => i.marketScore);
    expect(scores.filter((s) => s === 0)).toHaveLength(1);
    expect(scores.filter((s) => s === 60)).toHaveLength(4);
  });

  it("YouTube API가 실패해도 트렌드 없이 아이디어 생성을 진행한다", async () => {
    vi.mocked(listPopularVideos).mockRejectedValue(new Error("YOUTUBE_API_KEY가 설정되지 않았습니다."));
    vi.mocked(generateDailyIdeas).mockResolvedValue(fakeIdeas("no-trend"));

    const result = await generateTodayIdeas({ mode: "auto" }, NOW);

    expect(generateDailyIdeas).toHaveBeenCalledWith(expect.objectContaining({ trendTitles: undefined }));
    expect(result).toBeDefined();
  });

  it("manual 모드는 토픽을 그대로 전달하고 니치는 빈 배열로 저장한다", async () => {
    vi.mocked(generateDailyIdeas).mockResolvedValue(fakeIdeas("manual"));

    const result = await generateTodayIdeas({ mode: "manual", topic: "다이어트 브이로그" }, NOW);

    expect(generateDailyIdeas).toHaveBeenCalledWith({ mode: "manual", topic: "다이어트 브이로그" });
    expect(result.niches).toEqual([]);
  });

  it("같은 날 같은 모드로 재생성하면 기존 레코드를 덮어쓴다", async () => {
    vi.mocked(generateDailyIdeas).mockResolvedValueOnce(fakeIdeas("first")).mockResolvedValueOnce(fakeIdeas("second"));

    const first = await generateTodayIdeas({ mode: "manual", topic: "t" }, NOW);
    const second = await generateTodayIdeas({ mode: "manual", topic: "t" }, NOW);

    expect(second.id).toBe(first.id);
    expect((second.ideasJson as { title: string }[])[0].title).toBe("second-0");
  });

  it("직접 입력 모드로 생성해도 같은 날의 자동 모드 결과는 그대로 유지된다", async () => {
    vi.mocked(listPopularVideos).mockResolvedValue({ items: [] });
    vi.mocked(generateDailyIdeas).mockResolvedValueOnce(fakeIdeas("auto")).mockResolvedValueOnce(fakeIdeas("manual"));

    const autoResult = await generateTodayIdeas({ mode: "auto" }, NOW);
    await generateTodayIdeas({ mode: "manual", topic: "t" }, NOW);

    const autoStored = await getTodayIdeas("auto", NOW);
    const manualStored = await getTodayIdeas("manual", NOW);

    expect(autoStored?.id).toBe(autoResult.id);
    expect((autoStored?.ideasJson as { title: string }[])[0].title).toBe("auto-0");
    expect((manualStored?.ideasJson as { title: string }[])[0].title).toBe("manual-0");
  });
});
