import { generateDailyIdeas, type DailyIdea } from "@/lib/clients/anthropic";
import { listPopularVideos } from "@/lib/clients/youtube";
import { prisma } from "@/lib/prisma";
import { computeIdeaMarketScore } from "@/server/services/explore.service";
import { listNiches } from "@/server/services/niche.service";

// AI 주관 점수(recommendScore)에 더해, 아이디어의 대표 키워드로 실제 YouTube 시장 성과를 프록시한
// marketScore(0~100)를 함께 저장한다. 홈에서 두 점수를 사용자가 비율로 혼합해 재정렬한다.
export type ScoredDailyIdea = DailyIdea & { marketScore: number };

export function todayDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function getTodayIdeas(mode: "auto" | "manual", now: Date = new Date()) {
  return prisma.dailyIdea.findUnique({ where: { date_mode: { date: todayDateString(now), mode } } });
}

export type GenerateIdeasRequest =
  | { mode: "auto" }
  | { mode: "manual"; topic: string; targetAudience?: string; category?: string };

// UI_SPEC.md §7.1 "홈" 구현 노트: 니치·최근 트렌드(캐시된 인기 영상 제목)를 프롬프트 컨텍스트로 주입한다.
export async function generateTodayIdeas(request: GenerateIdeasRequest, now: Date = new Date()) {
  let ideas: DailyIdea[];
  let niches: string[] = [];

  if (request.mode === "auto") {
    niches = await listNiches();

    let trendTitles: string[] | undefined;
    try {
      const popular = await listPopularVideos({ regionCode: "KR", maxResults: 20 });
      trendTitles = popular.items.map((v) => v.snippet.title);
    } catch {
      trendTitles = undefined;
    }

    ideas = await generateDailyIdeas({ mode: "auto", niches, trendTitles });
  } else {
    ideas = await generateDailyIdeas(request);
  }

  // 각 아이디어에 실제 시장 성과 점수(marketScore)를 병렬로 붙인다. 한 아이디어의 검색이 실패해도
  // 그 아이디어만 0으로 격리해 전체 생성이 죽지 않게 한다(YouTube 쿼터 초과·일시 오류 대비).
  const scoredIdeas: ScoredDailyIdea[] = await Promise.all(
    ideas.map(async (idea) => {
      let marketScore = 0;
      try {
        marketScore = await computeIdeaMarketScore(idea.keywords);
      } catch {
        marketScore = 0;
      }
      return { ...idea, marketScore };
    }),
  );

  const date = todayDateString(now);
  return prisma.dailyIdea.upsert({
    where: { date_mode: { date, mode: request.mode } },
    create: { date, mode: request.mode, niches, ideasJson: scoredIdeas },
    update: { niches, ideasJson: scoredIdeas },
  });
}
