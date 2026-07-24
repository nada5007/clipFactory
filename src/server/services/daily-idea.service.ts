import { generateDailyIdeas, type DailyIdea } from "@/lib/clients/anthropic";
import { listPopularVideos } from "@/lib/clients/youtube";
import { prisma } from "@/lib/prisma";
import { listNiches } from "@/server/services/niche.service";

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

  const date = todayDateString(now);
  return prisma.dailyIdea.upsert({
    where: { date_mode: { date, mode: request.mode } },
    create: { date, mode: request.mode, niches, ideasJson: ideas },
    update: { niches, ideasJson: ideas },
  });
}
