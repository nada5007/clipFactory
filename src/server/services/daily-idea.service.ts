import { generateDailyIdeas, type DailyIdea, type NichePerformerContext } from "@/lib/clients/anthropic";
import { listPopularVideos } from "@/lib/clients/youtube";
import { prisma } from "@/lib/prisma";
import { computeIdeaMarketScore, getNicheTopPerformers } from "@/server/services/explore.service";
import { listNiches } from "@/server/services/niche.service";

// 각 니치에서 뽑을 실제 상위 성과 영상 개수(생성 그라운딩용 프롬프트 근거).
const NICHE_PERFORMERS_PER_NICHE = 5;

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

    // 생성 그라운딩: 각 니치의 실제 상위 성과 영상(VPH 순)을 모아 프롬프트 근거로 넘긴다. 한 니치의
    // 검색이 실패해도 나머지는 계속 진행한다(실패 니치는 그라운딩 없이 텍스트 니치만으로 처리).
    const performerLists = await Promise.all(
      niches.map((niche) => getNicheTopPerformers(niche, NICHE_PERFORMERS_PER_NICHE, now).catch(() => [])),
    );
    const nichePerformers: NichePerformerContext[] = performerLists.flat();

    ideas = await generateDailyIdeas({ mode: "auto", niches, trendTitles, nichePerformers });
  } else {
    ideas = await generateDailyIdeas(request);
  }

  // 각 아이디어에 실제 시장 성과 점수(marketScore)를 병렬로 붙인다. 아이디어의 소속 니치(idea.niche)를
  // 검색 문맥으로 넘겨 "니치 안에서의 성과"만 재도록 한다. 한 아이디어의 검색이 실패해도 그 아이디어만
  // 0으로 격리해 전체 생성이 죽지 않게 한다(YouTube 쿼터 초과·일시 오류 대비).
  const scoredIdeas: ScoredDailyIdea[] = await Promise.all(
    ideas.map(async (idea) => {
      let marketScore = 0;
      try {
        marketScore = await computeIdeaMarketScore(idea.keywords, idea.niche || undefined);
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
