"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { NICHE_CATALOG, QUICK_SURGE_NICHES } from "@/lib/niche-catalog";
import type { DailyIdea } from "@/lib/clients/anthropic";
import type { YoutubeVideo } from "@/lib/clients/youtube";

const numberFormat = new Intl.NumberFormat("ko-KR");
const WELCOME_DISMISSED_KEY = "clipfactory:home-welcome-dismissed";
// AI 주관 점수와 실제 시장 성과 점수를 혼합하는 비율(α=AI 비중 %). localStorage에 저장해 방문 간 유지한다.
const IDEA_BLEND_KEY = "clipfactory:idea-blend-weight";
const DEFAULT_BLEND_WEIGHT = 60;

// marketScore는 이 기능 도입 이후 생성된 아이디어에만 있다(이전 저장분은 undefined일 수 있음).
type ScoredIdea = DailyIdea & { marketScore?: number };
type DailyIdeaRecord = { id: string; date: string; mode: string; niches: unknown; ideasJson: ScoredIdea[] };
type SavedItem = { id: string; type: "VIDEO" | "CHANNEL" | "IDEA"; snapshotJson: Record<string, unknown>; createdAt: string };

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        selected ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function HomeClient() {
  const [niches, setNiches] = useState<string[]>([]);
  const [nicheDraft, setNicheDraft] = useState<Set<string>>(new Set());
  const [nichesLoading, setNichesLoading] = useState(true);
  const [nicheSaving, setNicheSaving] = useState(false);

  const [welcomeDismissed, setWelcomeDismissed] = useState(true);

  const [ideaMode, setIdeaMode] = useState<"auto" | "manual">("auto");
  const [topic, setTopic] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [category, setCategory] = useState("");
  const [todayIdea, setTodayIdea] = useState<DailyIdeaRecord | null>(null);
  const [ideaLoading, setIdeaLoading] = useState(true);
  const [ideaGenerating, setIdeaGenerating] = useState(false);
  const [ideaError, setIdeaError] = useState<string | null>(null);
  const [savedIdeaIndexes, setSavedIdeaIndexes] = useState<Set<number>>(new Set());
  const [blendWeight, setBlendWeight] = useState(DEFAULT_BLEND_WEIGHT); // AI 감각 비중(%). 나머지는 실제 성과.

  const [nicheVideos, setNicheVideos] = useState<YoutubeVideo[]>([]);
  const [recentSaved, setRecentSaved] = useState<SavedItem[]>([]);

  const fetchNiches = useCallback(() => {
    setNichesLoading(true);
    fetch("/api/insight/home/niches")
      .then((res) => res.json())
      .then((data: { niches: string[] }) => {
        setNiches(data.niches);
        setNicheDraft(new Set(data.niches));
      })
      .finally(() => setNichesLoading(false));
  }, []);

  const fetchIdeas = useCallback((mode: "auto" | "manual") => {
    setIdeaLoading(true);
    fetch(`/api/insight/home/ideas?${new URLSearchParams({ mode }).toString()}`)
      .then((res) => res.json())
      .then(setTodayIdea)
      .finally(() => setIdeaLoading(false));
  }, []);

  useEffect(() => {
    fetchNiches();
    setWelcomeDismissed(localStorage.getItem(WELCOME_DISMISSED_KEY) === "true");

    const savedBlend = Number(localStorage.getItem(IDEA_BLEND_KEY));
    if (Number.isFinite(savedBlend) && savedBlend >= 0 && savedBlend <= 100) setBlendWeight(savedBlend);

    fetch("/api/saved-items")
      .then((res) => res.json())
      .then((items: SavedItem[]) => setRecentSaved(items.slice(0, 5)));
  }, [fetchNiches]);

  const changeBlendWeight = (value: number) => {
    setBlendWeight(value);
    try {
      localStorage.setItem(IDEA_BLEND_KEY, String(value));
    } catch {
      // localStorage 접근 불가 환경에서도 조정 자체는 동작해야 하므로 무시한다.
    }
  };

  // 두 점수(AI 주관 recommendScore, 실제 성과 marketScore)를 α 비율로 혼합해 표시 점수를 계산하고
  // 그 순서로 재정렬한다. 저장 상태 추적(savedIdeaIndexes)은 원본 인덱스 기준이라 originalIndex를 보존한다.
  const rankedIdeas = useMemo(() => {
    if (!todayIdea) return [];
    const alpha = blendWeight / 100;
    return todayIdea.ideasJson
      .map((idea, originalIndex) => {
        const market = typeof idea.marketScore === "number" ? idea.marketScore : null;
        const blended =
          market === null ? idea.recommendScore : Math.round(alpha * idea.recommendScore + (1 - alpha) * market);
        return { idea, originalIndex, market, blended };
      })
      .sort((a, b) => b.blended - a.blended);
  }, [todayIdea, blendWeight]);

  const hasMarketScores = rankedIdeas.some((r) => r.market !== null);

  // 자동/직접 입력 모드는 서로 독립된 결과를 가지므로, 모드를 바꾸면 그 모드의 오늘자 결과를 다시 불러온다.
  useEffect(() => {
    setTodayIdea(null);
    setSavedIdeaIndexes(new Set());
    fetchIdeas(ideaMode);
  }, [ideaMode, fetchIdeas]);

  useEffect(() => {
    if (niches.length === 0) return;
    fetch(`/api/insight/home/niche-videos?${new URLSearchParams({ niche: niches[0] }).toString()}`)
      .then((res) => res.json())
      .then((data: { videos: YoutubeVideo[] }) => setNicheVideos(data.videos ?? []))
      .catch(() => setNicheVideos([]));
  }, [niches]);

  const toggleNicheDraft = (value: string) => {
    setNicheDraft((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const saveNiches = () => {
    setNicheSaving(true);
    fetch("/api/insight/home/niches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niches: Array.from(nicheDraft) }),
    })
      .then((res) => res.json())
      .then((data: { niches: string[] }) => setNiches(data.niches))
      .finally(() => setNicheSaving(false));
  };

  // PROJECT_SPEC.md §2.3 "홈 '나의 니치' 재설정 기능": 최초 설정 후 다시 바꿀 UI 경로가 없던 문제를 해결한다.
  const resetNiches = () => {
    setNicheSaving(true);
    fetch("/api/insight/home/niches", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niches: [] }),
    })
      .then((res) => res.json())
      .then((data: { niches: string[] }) => {
        setNiches(data.niches);
        setNicheDraft(new Set());
      })
      .finally(() => setNicheSaving(false));
  };

  const generateIdeas = () => {
    setIdeaGenerating(true);
    setIdeaError(null);
    setSavedIdeaIndexes(new Set());

    const body =
      ideaMode === "auto"
        ? { mode: "auto" as const }
        : { mode: "manual" as const, topic, targetAudience: targetAudience || undefined, category: category || undefined };

    if (ideaMode === "manual" && !topic.trim()) {
      setIdeaError("토픽을 입력하세요.");
      setIdeaGenerating(false);
      return;
    }

    fetch("/api/insight/home/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "아이디어 생성에 실패했습니다.");
        setTodayIdea(data);
      })
      .catch((e) => setIdeaError(e instanceof Error ? e.message : "아이디어 생성에 실패했습니다."))
      .finally(() => setIdeaGenerating(false));
  };

  const saveIdea = (idea: DailyIdea, index: number) => {
    fetch("/api/saved-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "IDEA",
        snapshot: {
          title: idea.title,
          hook: idea.hook,
          differentiator: idea.differentiator,
          keywords: idea.keywords,
        },
      }),
    }).then((res) => {
      if (res.ok) setSavedIdeaIndexes((prev) => new Set(prev).add(index));
    });
  };

  const dismissWelcome = () => {
    localStorage.setItem(WELCOME_DISMISSED_KEY, "true");
    setWelcomeDismissed(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">나의 니치:</span>
          {niches.length === 0 ? (
            <span className="text-sm text-muted-foreground">미설정</span>
          ) : (
            niches.map((n) => (
              <span key={n} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {n}
              </span>
            ))
          )}
        </div>
        {niches.length > 0 && (
          <Button variant="outline" size="sm" onClick={resetNiches} disabled={nicheSaving}>
            {nicheSaving ? "초기화 중..." : "초기화"}
          </Button>
        )}
      </div>

      {!welcomeDismissed && (
        <div className="relative rounded-lg border bg-card p-4">
          <button
            type="button"
            onClick={dismissWelcome}
            className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
            aria-label="닫기"
          >
            ✕
          </button>
          <p className="font-medium">유튜브 데이터 분석에 오신 것을 환영합니다</p>
          <p className="mt-1 text-sm text-muted-foreground">
            키워드 탐색, 경쟁 채널 분석, SEO 최적화, 떡상 패턴 발굴 등을 한곳에서 제공하는 채널 성장 종합 도구입니다.
            상단 탭에서 원하는 기능을 선택하세요.
          </p>
        </div>
      )}

      {!nichesLoading && niches.length === 0 && (
        <div className="rounded-lg border bg-card p-4">
          <p className="mb-1 font-medium">니치를 설정하면 AI 아이디어 품질이 좋아집니다</p>
          <p className="mb-3 text-xs text-muted-foreground">관심 있는 카테고리를 1개 이상 선택하세요.</p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {NICHE_CATALOG.map((n) => (
              <Chip key={n} selected={nicheDraft.has(n)} onClick={() => toggleNicheDraft(n)}>
                {n}
              </Chip>
            ))}
          </div>
          <Button size="sm" onClick={saveNiches} disabled={nicheSaving || nicheDraft.size === 0}>
            {nicheSaving ? "저장 중..." : "니치 저장"}
          </Button>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">오늘의 AI 아이디어</h2>
            <div className="flex gap-1 rounded-lg border bg-muted p-1 w-fit">
              {(["auto", "manual"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setIdeaMode(m)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    ideaMode === m ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "auto" ? "자동 (니치 기반)" : "직접 입력"}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={generateIdeas} disabled={ideaGenerating}>
            {ideaGenerating ? "생성 중..." : todayIdea ? "⟳ 재생성" : "오늘의 아이디어 생성"}
          </Button>
        </div>

        {/* AI 주관 점수 vs 실제 시장 성과 점수 혼합 비율. 조정 시 API 재호출 없이 즉시 재정렬된다. */}
        {todayIdea && hasMarketScores && (
          <div className="mb-3 flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">랭킹 기준</span>
            <span className="shrink-0 text-xs text-primary">AI 감각 {blendWeight}%</span>
            <Slider
              value={[blendWeight]}
              onValueChange={([v]) => changeBlendWeight(v)}
              min={0}
              max={100}
              step={5}
              className="flex-1"
              aria-label="AI 감각 대 실제 성과 혼합 비율"
            />
            <span className="shrink-0 text-xs text-primary">실제 성과 {100 - blendWeight}%</span>
          </div>
        )}

        {ideaMode === "manual" && (
          <div className="mb-3 flex flex-col gap-3 rounded-lg bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">
              직접 주제·타깃·카테고리를 지정해 5개 아이디어를 받습니다 (저장된 자동 모드 결과는 그대로 유지됨).
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="주제/제품 (예: 다이어트 / 비트코인 ETF / 스탠리 텀블러)"
                className="max-w-sm"
              />
              <Input
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="타깃 시청자 (선택, 예: 30대 직장인 / 자취생)"
                className="max-w-sm"
              />
            </div>
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">카테고리 (선택, 1개 클릭)</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip selected={category === ""} onClick={() => setCategory("")}>
                  없음
                </Chip>
                {NICHE_CATALOG.map((n) => (
                  <Chip key={n} selected={category === n} onClick={() => setCategory(n)}>
                    {n}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        )}

        {ideaError && <p className="mb-2 text-sm text-destructive">{ideaError}</p>}

        {ideaLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중...</p>
        ) : !todayIdea ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            아직 오늘의 아이디어가 없습니다. 위 버튼을 눌러 5개 시드를 받아보세요.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {rankedIdeas.map(({ idea, originalIndex, market, blended }) => (
              <div key={originalIndex} className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{idea.title}</p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      강추 {blended}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      AI {idea.recommendScore} · 성과 {market ?? "—"}
                    </span>
                  </div>
                </div>
                <p className="text-primary">왜 좋은가: {idea.whyGood}</p>
                <p className="text-muted-foreground">후킹: {idea.hook}</p>
                <p className="text-muted-foreground">차별화: {idea.differentiator}</p>
                <p className="text-muted-foreground">키워드: {idea.keywords.join(", ")}</p>
                <div className="mt-1 flex justify-end gap-1.5">
                  <a
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(idea.keywords[0] ?? idea.title)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    ▶ YouTube
                  </a>
                  <Link
                    href={`/analytics/explore?mode=analyze&keyword=${encodeURIComponent(idea.keywords[0] ?? idea.title)}`}
                    className="inline-flex items-center rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    🔍 분석
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={savedIdeaIndexes.has(originalIndex)}
                    onClick={() => saveIdea(idea, originalIndex)}
                  >
                    {savedIdeaIndexes.has(originalIndex) ? "저장됨" : "🔖 저장"}
                  </Button>
                </div>
              </div>
            ))}
            <p className="text-right text-xs text-muted-foreground">
              {hasMarketScores
                ? "# 혼합 점수 — AI 주관 점수 + 키워드 시장 성과(YouTube 실제 조회수 기반) 프록시."
                : "# AI 생성 주관 점수. (재생성하면 실제 시장 성과 점수도 함께 계산됩니다.)"}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">빠른 떡상 발굴</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_SURGE_NICHES.map((n) => (
              <Link
                key={n}
                href={`/analytics/trending?keyword=${encodeURIComponent(n)}`}
                className="rounded-full border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {n}
              </Link>
            ))}
          </div>
          <Link href="/analytics/trending" className="mt-2 inline-block text-xs text-primary">
            전체 보기 →
          </Link>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">니치 인기</h3>
          {niches.length === 0 ? (
            <p className="text-xs text-muted-foreground">니치를 설정하면 인기 영상을 보여드려요.</p>
          ) : nicheVideos.length === 0 ? (
            <p className="text-xs text-muted-foreground">불러오는 중...</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {nicheVideos.map((v) => (
                <li key={v.id}>
                  <a
                    href={`https://www.youtube.com/watch?v=${v.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-md hover:bg-muted"
                  >
                    <div className="aspect-video w-20 shrink-0 overflow-hidden rounded bg-muted">
                      {v.snippet.thumbnails?.medium?.url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={v.snippet.thumbnails.medium.url}
                          alt={v.snippet.title}
                          className="size-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 text-xs">
                      <p className="line-clamp-2 font-medium">{v.snippet.title}</p>
                      <p className="text-muted-foreground">조회수 {numberFormat.format(Number(v.statistics.viewCount ?? 0))}회</p>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/analytics/explore?niche=${encodeURIComponent(niches[0] ?? "")}`}
            className="mt-2 inline-block text-xs text-primary"
          >
            더보기 →
          </Link>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">최근 저장</h3>
          {recentSaved.length === 0 ? (
            <p className="text-xs text-muted-foreground">저장된 항목이 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentSaved.map((item) => (
                <li key={item.id} className="text-xs">
                  <p className="line-clamp-1 font-medium">
                    {String(item.snapshotJson.title ?? "제목 없음")}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link href="/analytics/saved" className="mt-2 inline-block text-xs text-primary">
            모두 보기 →
          </Link>
        </div>
      </div>
    </div>
  );
}
