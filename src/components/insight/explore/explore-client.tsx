"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KeywordScorePanel } from "@/components/insight/explore/keyword-score-panel";
import { VideoDetailModal } from "@/components/insight/video-analysis/video-detail-modal";
import {
  EXPLORE_CATEGORIES,
  MIN_VIEW_OPTIONS,
  PERFORMANCE_TIER_LABELS,
  PERFORMANCE_TIER_ORDER,
  PERIOD_OPTIONS,
  REGION_OPTIONS,
  VIDEO_FORM_OPTIONS,
  type ExplorePeriod,
  type MinViewFilter,
  type PerformanceTier,
  type VideoForm,
} from "@/lib/explore-options";
import { NICHE_CATALOG } from "@/lib/niche-catalog";
import { formatRevenueLabel, formatVphLabel } from "@/lib/performance-tier";
import { cn } from "@/lib/utils";
import type { BrowseVideoItem, BrowseVideosResult } from "@/server/services/explore.service";

const numberFormat = new Intl.NumberFormat("ko-KR");

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

type Filters = {
  region: string;
  category: string;
  videoForm: VideoForm;
  period: ExplorePeriod;
  query: string;
  niche: string | null;
  krOnly: boolean;
  autoTranslate: boolean;
  performanceTiers: Set<PerformanceTier>;
  minViewFilter: MinViewFilter;
  channelUniqueOnly: boolean;
};

const DEFAULT_FILTERS: Filters = {
  region: "KR",
  category: "ALL",
  videoForm: "all",
  period: "24h",
  query: "",
  niche: null,
  krOnly: true,
  autoTranslate: false,
  performanceTiers: new Set(),
  minViewFilter: "all",
  channelUniqueOnly: false,
};

export function ExploreClient() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"browse" | "analyze">("browse");
  const [analyzeSeedKeyword, setAnalyzeSeedKeyword] = useState<string | null>(null);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [result, setResult] = useState<BrowseVideosResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedModalTab, setSelectedModalTab] = useState<"overview" | "captions" | "similar" | "script-pattern">("overview");
  const [savedVideoIds, setSavedVideoIds] = useState<Set<string>>(new Set());
  const [translatedTitles, setTranslatedTitles] = useState<Record<string, string>>({});
  const [translatingIds, setTranslatingIds] = useState<Set<string>>(new Set());

  const fetchVideos = useCallback((overrides?: Partial<Filters>) => {
    const f = { ...filters, ...overrides };
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      region: f.region,
      category: f.category,
      period: f.period,
      videoForm: f.videoForm,
      krOnly: String(f.krOnly),
      minView: f.minViewFilter,
      channelUniqueOnly: String(f.channelUniqueOnly),
    });
    if (f.query.trim()) params.set("query", f.query.trim());
    if (f.niche) params.set("niche", f.niche);
    if (f.performanceTiers.size > 0) params.set("tiers", Array.from(f.performanceTiers).join(","));

    fetch(`/api/insight/explore/browse?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "영상을 불러오지 못했습니다.");
        setResult(body);
        if (f.autoTranslate && body.videos?.length > 0) {
          fetch("/api/insight/explore/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ titles: body.videos.map((v: BrowseVideoItem) => v.snippet.title) }),
          })
            .then((r) => r.json())
            .then((t) => {
              if (Array.isArray(t.translations)) {
                const next: Record<string, string> = {};
                body.videos.forEach((v: BrowseVideoItem, i: number) => {
                  next[v.id] = t.translations[i];
                });
                setTranslatedTitles((prev) => ({ ...prev, ...next }));
              }
            })
            .catch(() => undefined);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "영상을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // UI_SPEC.md §7.1 "홈" 연결성 요구사항: 아이디어 카드 [분석] 버튼(?mode=analyze&keyword=)과
  // 니치 인기 영상 [더보기](?niche=)에서 딥링크로 진입할 수 있게 한다.
  useEffect(() => {
    const modeParam = searchParams.get("mode");
    const keywordParam = searchParams.get("keyword");
    const nicheParam = searchParams.get("niche");

    if (modeParam === "analyze" && keywordParam) {
      setMode("analyze");
      setAnalyzeSeedKeyword(keywordParam);
      return;
    }

    if (nicheParam) {
      setFilters((prev) => ({ ...prev, niche: nicheParam }));
      fetchVideos({ niche: nicheParam });
      return;
    }

    fetchVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = () => fetchVideos();

  const toggleTier = (tier: PerformanceTier) => {
    const next = new Set(filters.performanceTiers);
    if (next.has(tier)) next.delete(tier);
    else next.add(tier);
    setFilters((prev) => ({ ...prev, performanceTiers: next }));
    fetchVideos({ performanceTiers: next });
  };

  const setMinView = (value: MinViewFilter) => {
    setFilters((prev) => ({ ...prev, minViewFilter: value }));
    fetchVideos({ minViewFilter: value });
  };

  const toggleChannelUnique = (checked: boolean) => {
    setFilters((prev) => ({ ...prev, channelUniqueOnly: checked }));
    fetchVideos({ channelUniqueOnly: checked });
  };

  const selectNiche = (niche: string) => {
    const next = filters.niche === niche ? null : niche;
    setFilters((prev) => ({ ...prev, niche: next, query: "" }));
    fetchVideos({ niche: next, query: "" });
  };

  const openModal = (videoId: string, tab: typeof selectedModalTab) => {
    setSelectedModalTab(tab);
    setSelectedVideoId(videoId);
  };

  const translateOne = (video: BrowseVideoItem) => {
    if (translatedTitles[video.id]) {
      setTranslatedTitles((prev) => {
        const next = { ...prev };
        delete next[video.id];
        return next;
      });
      return;
    }
    setTranslatingIds((prev) => new Set(prev).add(video.id));
    fetch("/api/insight/explore/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titles: [video.snippet.title] }),
    })
      .then((res) => res.json())
      .then((body) => {
        if (body.translations?.[0]) {
          setTranslatedTitles((prev) => ({ ...prev, [video.id]: body.translations[0] }));
        }
      })
      .finally(() => {
        setTranslatingIds((prev) => {
          const next = new Set(prev);
          next.delete(video.id);
          return next;
        });
      });
  };

  const saveVideo = (video: BrowseVideoItem) => {
    fetch("/api/saved-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "VIDEO",
        snapshot: {
          videoId: video.id,
          title: video.snippet.title,
          channelTitle: video.snippet.channelTitle,
          viewCount: Number(video.statistics.viewCount ?? 0),
        },
      }),
    }).then((res) => {
      if (res.ok) setSavedVideoIds((prev) => new Set(prev).add(video.id));
    });
  };

  const goToAnalyzeWithKeyword = (keyword: string) => {
    setAnalyzeSeedKeyword(keyword);
    setMode("analyze");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border bg-muted p-1 w-fit">
          {(["browse", "analyze"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                mode === m ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "browse" ? "탐색" : "분석"}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          VPH·성능 등급·추정 수익은 자체 산출 분석이며 YouTube 공식 지표가 아닙니다.
        </p>
      </div>

      {mode === "analyze" ? (
        <KeywordScorePanel seedKeyword={analyzeSeedKeyword} />
      ) : (
        <>
          <div>
            <h2 className="text-lg font-semibold">지금 뜨는 영상</h2>
            <p className="text-sm text-muted-foreground">국가·카테고리·기간 내 조회수 상위 영상을 확인합니다. 검색어는 선택사항입니다.</p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <Checkbox checked={filters.krOnly} onCheckedChange={(v) => setFilters((p) => ({ ...p, krOnly: Boolean(v) }))} />
                한국어만 (KR 전용)
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={filters.autoTranslate}
                  onCheckedChange={(v) => setFilters((p) => ({ ...p, autoTranslate: Boolean(v) }))}
                />
                외국 영상 자동 번역
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <Select value={filters.region} onValueChange={(v) => setFilters((p) => ({ ...p, region: v }))}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGION_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.category} onValueChange={(v) => setFilters((p) => ({ ...p, category: v }))}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPLORE_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                      {c.avgRevenueLabel ? ` · ${c.avgRevenueLabel}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.videoForm} onValueChange={(v) => setFilters((p) => ({ ...p, videoForm: v as VideoForm }))}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIDEO_FORM_OPTIONS.map((v) => (
                    <SelectItem key={v.value} value={v.value}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.period} onValueChange={(v) => setFilters((p) => ({ ...p, period: v as ExplorePeriod }))}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                value={filters.query}
                onChange={(e) => setFilters((p) => ({ ...p, query: e.target.value, niche: null }))}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="검색어 (선택)"
                className="max-w-xs"
              />
              <Button onClick={runSearch} disabled={loading}>
                {loading ? "탐색 중..." : "탐색"}
              </Button>
            </div>

            <div>
              <p className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>한국형 서브카테고리</span>
                <span>YouTube 공식 분류 외 한국 사용 패턴 시드</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {NICHE_CATALOG.map((n) => (
                  <Chip key={n} selected={filters.niche === n} onClick={() => selectNiche(n)}>
                    {n}
                  </Chip>
                ))}
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {result && !loading && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{result.videos.length}개 결과{result.usedChart ? " · YouTube 공식 인기 차트" : ""}</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Chip selected={filters.performanceTiers.size === 0} onClick={() => { setFilters((p) => ({ ...p, performanceTiers: new Set() })); fetchVideos({ performanceTiers: new Set() }); }}>
                  전체 {Object.values(result.tierCounts).reduce((a, b) => a + b, 0)}
                </Chip>
                {PERFORMANCE_TIER_ORDER.map((tier) => (
                  <Chip key={tier} selected={filters.performanceTiers.has(tier)} onClick={() => toggleTier(tier)}>
                    {tier === "explosive" ? "🔥 " : ""}
                    {PERFORMANCE_TIER_LABELS[tier]} {result.tierCounts[tier] ?? 0}
                  </Chip>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {MIN_VIEW_OPTIONS.map((o) => (
                  <Chip key={o.value} selected={filters.minViewFilter === o.value} onClick={() => setMinView(o.value)}>
                    {o.label}
                  </Chip>
                ))}
                <label className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox checked={filters.channelUniqueOnly} onCheckedChange={(v) => toggleChannelUnique(Boolean(v))} />
                  채널당 1개만
                </label>
              </div>
            </>
          )}

          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">불러오는 중...</div>
          ) : !result || result.videos.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">결과가 없습니다. 기간을 넓히거나 필터를 완화해보세요.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.videos.map((video) => (
                <div key={video.id} className="flex flex-col gap-2 overflow-hidden rounded-lg border bg-card">
                  <a
                    href={`https://www.youtube.com/watch?v=${video.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-video bg-muted"
                  >
                    {video.snippet.thumbnails?.medium?.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={video.snippet.thumbnails.medium.url}
                        alt={video.snippet.title}
                        className="size-full object-cover"
                      />
                    )}
                  </a>
                  <div className="flex flex-col gap-1.5 px-2 pb-2">
                    <div className="flex flex-wrap gap-1">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {PERFORMANCE_TIER_LABELS[video.performanceTier]} · {formatVphLabel(video.vph)}
                      </span>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600">
                        {formatRevenueLabel(video.estimatedRevenueKrw)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm font-medium" title={video.snippet.title}>
                      {translatedTitles[video.id] ?? video.snippet.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{video.snippet.channelTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      조회 {numberFormat.format(Number(video.statistics.viewCount ?? 0))} · 좋아요{" "}
                      {numberFormat.format(Number(video.statistics.likeCount ?? 0))} · 댓글{" "}
                      {numberFormat.format(Number(video.statistics.commentCount ?? 0))}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Button variant="outline" size="sm" onClick={() => openModal(video.id, "overview")}>
                        분석
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openModal(video.id, "similar")}>
                        드릴다운
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openModal(video.id, "captions")}>
                        자막 복사
                      </Button>
                      <Button variant="outline" size="sm" className="border-primary/40 text-primary" onClick={() => openModal(video.id, "script-pattern")}>
                        대본 패턴
                      </Button>
                      <Button variant="outline" size="sm" disabled={translatingIds.has(video.id)} onClick={() => translateOne(video)}>
                        {translatedTitles[video.id] ? "원문 보기" : "번역"}
                      </Button>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      disabled={savedVideoIds.has(video.id)}
                      onClick={() => saveVideo(video)}
                    >
                      {savedVideoIds.has(video.id) ? "저장됨" : "저장"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {result && result.topTopics.length > 0 && (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-sm font-medium">이 결과의 핵심 토픽</p>
              <div className="flex flex-wrap gap-1.5">
                {result.topTopics.map((topic) => (
                  <button
                    key={topic.term}
                    type="button"
                    onClick={() => goToAnalyzeWithKeyword(topic.term)}
                    className="rounded-full border border-input px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                  >
                    {topic.term} ×{topic.count}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">클릭 시 분석 모드로 재검색</p>
            </div>
          )}
        </>
      )}

      <VideoDetailModal
        videoUrl={selectedVideoId}
        open={selectedVideoId !== null}
        onOpenChange={(open) => !open && setSelectedVideoId(null)}
        initialTab={selectedModalTab}
      />
    </div>
  );
}
