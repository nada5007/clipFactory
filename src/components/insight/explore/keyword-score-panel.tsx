"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { VideoDetailModal } from "@/components/insight/video-analysis/video-detail-modal";
import {
  MIN_VIEW_OPTIONS,
  PERFORMANCE_TIER_LABELS,
  PERFORMANCE_TIER_ORDER,
  minViewFilterToCount,
  type MinViewFilter,
  type PerformanceTier,
} from "@/lib/explore-options";
import { computeOpportunityScore, type OpportunityWeights } from "@/lib/opportunity-score";
import { formatRevenueLabel, formatVphLabel } from "@/lib/performance-tier";
import { cn } from "@/lib/utils";
import type { AnalyzedTopVideo, BulkKeywordAnalysis, KeywordMarketAnalysis } from "@/server/services/explore.service";

const numberFormat = new Intl.NumberFormat("ko-KR");
const percentFormat = new Intl.NumberFormat("ko-KR", { style: "percent", maximumFractionDigits: 1 });

type Analysis = KeywordMarketAnalysis;

const BREAKDOWN_LABELS: { key: keyof Analysis["breakdown"]; label: string; max: number }[] = [
  { key: "viewScore", label: "조회수", max: 40 },
  { key: "recencyScore", label: "최신성", max: 20 },
  { key: "engagementScore", label: "참여율", max: 20 },
  { key: "competitionScore", label: "경쟁도(낮을수록 유리)", max: 20 },
];

// 가중치 슬라이더는 0~100 스케일로 조작한다(lib의 DEFAULT_OPPORTUNITY_WEIGHTS는 0~1 비율이라 별도 정의 —
// computeOpportunityScore는 weightSum으로 정규화하므로 절대 스케일은 무관하고 상대 비율만 반영된다).
const DEFAULT_UI_WEIGHTS: OpportunityWeights = { popularity: 25, entryDifficulty: 25, newChannelShare: 25, recency: 25 };

const OPPORTUNITY_ITEMS: { key: keyof OpportunityWeights; label: string; detail: (a: Analysis) => string }[] = [
  { key: "popularity", label: "인기도", detail: (a) => `${numberFormat.format(a.stats.medianViewCount)}회 (높을수록 사람들이 많이 보는 주제)` },
  { key: "entryDifficulty", label: "진입 난이도", detail: (a) => `상위 채널 평균 구독자 ${numberFormat.format(a.stats.medianChannelSubscriberCount)} (낮을수록 진입 쉬움)` },
  { key: "newChannelShare", label: "신생 채널 비중", detail: () => "구독 10만↓ 채널이 상위에서 얼마나 활약하나" },
  { key: "recency", label: "최신성", detail: () => "상위 영상이 얼마나 최근 게시인지 (7일 이내=100점, 1년 이상=0점)" },
];

function TopVideoRow({
  video,
  rank,
  onOpenModal,
}: {
  video: AnalyzedTopVideo;
  rank: number;
  onOpenModal: (videoId: string, tab: "captions" | "script-pattern") => void;
}) {
  return (
    <div className="flex items-center gap-3 border-t p-2 text-sm first:border-t-0">
      <span className="w-5 shrink-0 text-center text-xs text-muted-foreground">{rank}</span>
      <a
        href={`https://www.youtube.com/watch?v=${video.videoId}`}
        target="_blank"
        rel="noreferrer"
        className="aspect-video w-24 shrink-0 overflow-hidden rounded bg-muted"
      >
        {video.thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnailUrl} alt={video.title} className="size-full object-cover" />
        )}
      </a>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 font-medium">{video.title}</p>
        <p className="text-xs text-muted-foreground">{video.channelTitle}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            {PERFORMANCE_TIER_LABELS[video.performanceTier]} · {formatVphLabel(video.vph)}
          </span>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600">
            {formatRevenueLabel(video.estimatedRevenueKrw)}
          </span>
        </div>
        <div className="mt-1 flex gap-1">
          <Button variant="outline" size="sm" onClick={() => onOpenModal(video.videoId, "captions")}>
            자막
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-primary/40 text-primary"
            onClick={() => onOpenModal(video.videoId, "script-pattern")}
          >
            대본 패턴
          </Button>
        </div>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">조회 {numberFormat.format(video.viewCount)}</span>
    </div>
  );
}

export function KeywordScorePanel({ seedKeyword }: { seedKeyword?: string | null }) {
  const [keyword, setKeyword] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bulkMode, setBulkMode] = useState(false);
  const [bulkKeywords, setBulkKeywords] = useState("");
  const [bulkResults, setBulkResults] = useState<BulkKeywordAnalysis[] | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const [relatedKeywords, setRelatedKeywords] = useState<string[] | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);

  const [weights, setWeights] = useState<OpportunityWeights>(DEFAULT_UI_WEIGHTS);
  const [showWeightAdjust, setShowWeightAdjust] = useState(false);
  const [selectedTiers, setSelectedTiers] = useState<Set<PerformanceTier>>(new Set());
  const [minViewFilter, setMinViewFilter] = useState<MinViewFilter>("all");

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedModalTab, setSelectedModalTab] = useState<"captions" | "script-pattern">("captions");

  const runAnalysis = (explicitKeyword?: string) => {
    const trimmed = (explicitKeyword ?? keyword).trim();
    if (!trimmed) {
      setError("키워드를 입력하세요.");
      return;
    }
    setLoading(true);
    setError(null);
    setRelatedKeywords(null);
    setSelectedTiers(new Set());
    setMinViewFilter("all");
    setWeights(DEFAULT_UI_WEIGHTS);

    fetch(`/api/insight/explore/keyword-score?${new URLSearchParams({ keyword: trimmed }).toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "키워드 시장성을 분석하지 못했습니다.");
        setAnalysis(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "키워드 시장성을 분석하지 못했습니다."))
      .finally(() => setLoading(false));
  };

  // UI_SPEC.md §7.1 "탐색·분석": 결과 하단 "핵심 토픽" 클릭 또는 홈 아이디어 카드의 [분석] 클릭 시 자동 실행된다.
  useEffect(() => {
    if (seedKeyword) {
      setKeyword(seedKeyword);
      runAnalysis(seedKeyword);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKeyword]);

  const runBulkAnalysis = () => {
    const keywords = bulkKeywords
      .split("\n")
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 10);
    if (keywords.length === 0) {
      setBulkError("키워드를 한 줄에 하나씩 입력하세요 (최대 10개).");
      return;
    }
    setBulkLoading(true);
    setBulkError(null);

    fetch(`/api/insight/explore/keyword-score?${new URLSearchParams({ keywords: keywords.join(",") }).toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "키워드 시장성을 분석하지 못했습니다.");
        setBulkResults(body.results);
      })
      .catch((e) => setBulkError(e instanceof Error ? e.message : "키워드 시장성을 분석하지 못했습니다."))
      .finally(() => setBulkLoading(false));
  };

  const suggestRelated = () => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setError("키워드를 입력하세요.");
      return;
    }
    setRelatedLoading(true);
    fetch(`/api/insight/explore/related-keywords?${new URLSearchParams({ keyword: trimmed }).toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "연관 키워드를 생성하지 못했습니다.");
        setRelatedKeywords(body.keywords);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "연관 키워드를 생성하지 못했습니다."))
      .finally(() => setRelatedLoading(false));
  };

  const openModal = (videoId: string, tab: "captions" | "script-pattern") => {
    setSelectedModalTab(tab);
    setSelectedVideoId(videoId);
  };

  const toggleTier = (tier: PerformanceTier) => {
    setSelectedTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  };

  const tierCounts = analysis
    ? PERFORMANCE_TIER_ORDER.reduce(
        (acc, tier) => ({ ...acc, [tier]: analysis.topVideos.filter((v) => v.performanceTier === tier).length }),
        {} as Record<PerformanceTier, number>,
      )
    : null;

  const filteredTopVideos = analysis
    ? analysis.topVideos.filter(
        (v) =>
          (selectedTiers.size === 0 || selectedTiers.has(v.performanceTier)) &&
          v.viewCount >= minViewFilterToCount(minViewFilter),
      )
    : [];

  const opportunity = analysis ? computeOpportunityScore(analysis.opportunityScore, weights) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">이 키워드의 시장성</h2>
          <p className="text-sm text-muted-foreground">
            추천 점수 = 검색량 점수 × (1 − 경쟁도). 검색 많은데 경쟁 덜한 키워드일수록 높습니다.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border bg-muted p-1 w-fit text-xs">
          <button
            type="button"
            onClick={() => setBulkMode(false)}
            className={cn("rounded-md px-2.5 py-1 font-medium transition-colors", !bulkMode ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            단일
          </button>
          <button
            type="button"
            onClick={() => setBulkMode(true)}
            className={cn("rounded-md px-2.5 py-1 font-medium transition-colors", bulkMode ? "bg-background shadow-sm" : "text-muted-foreground")}
          >
            복수(최대 10개)
          </button>
        </div>
      </div>

      {!bulkMode ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runAnalysis()}
              placeholder="예: 자기계발"
              className="max-w-sm"
            />
            <Button onClick={() => runAnalysis()} disabled={loading}>
              {loading ? "분석 중..." : "분석"}
            </Button>
            <Button variant="outline" onClick={suggestRelated} disabled={relatedLoading}>
              {relatedLoading ? "생성 중..." : "추천 키워드"}
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {relatedKeywords && relatedKeywords.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">추천 키워드:</span>
              {relatedKeywords.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKeyword(k);
                    runAnalysis(k);
                  }}
                  className="rounded-full border border-input px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-primary"
                >
                  {k}
                </button>
              ))}
            </div>
          )}

          {analysis && opportunity && (
            <>
              <div className="flex items-center justify-between">
                <h3 className="font-medium">&ldquo;{analysis.keyword}&rdquo; 분석 결과</h3>
                <Link
                  href={`/analytics/surge?keyword=${encodeURIComponent(analysis.keyword)}`}
                  className="shrink-0 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  떡상 영상 키워드 모드로 재검색 →
                </Link>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">검색량 (인기)</p>
                  <p className="text-2xl font-bold">{analysis.searchVolumeScore} <span className="text-sm font-normal text-muted-foreground">/100</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">원본 상위 영상 평균 조회수: {numberFormat.format(analysis.stats.medianViewCount)}</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">경쟁도 (큰 채널 점령)</p>
                  <p className="text-2xl font-bold">{Math.round(analysis.competitionRatio * 100)} <span className="text-sm font-normal text-muted-foreground">/100</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">원본 상위 채널 평균 구독자: {numberFormat.format(analysis.stats.medianChannelSubscriberCount)}</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">추천 점수</p>
                  <p className="text-2xl font-bold">{analysis.recommendScore} <span className="text-sm font-normal text-muted-foreground">/100</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">원본 표본: {numberFormat.format(analysis.stats.videoCount)}개 영상</p>
                </div>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <span className="font-medium">종합 기회 점수</span>
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">4가지 합산</span>
                  </div>
                  <span className="text-3xl font-bold text-primary">
                    {opportunity.total} <span className="text-sm font-normal text-muted-foreground">/100</span>
                  </span>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  인기도 + 경쟁 강도(역수) + 신생 채널 비중 + 최신성을 합산. 높을수록 지금 새로 만들기 좋은 키워드.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {OPPORTUNITY_ITEMS.map(({ key, label, detail }) => (
                    <div key={key}>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="text-lg font-semibold">{opportunity[key]}</p>
                      <p className="text-xs text-muted-foreground">{detail(analysis)}</p>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowWeightAdjust((v) => !v)}
                  className="mt-3 text-xs text-primary hover:underline"
                >
                  {showWeightAdjust ? "▾" : "▸"} 가중치 조정 — 내 채널 우선순위로 종합 점수 재계산
                </button>
                {showWeightAdjust && (
                  <div className="mt-2 flex flex-col gap-2 border-t pt-2">
                    {OPPORTUNITY_ITEMS.map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2 text-xs">
                        <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={weights[key]}
                          onChange={(e) => setWeights((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                          className="flex-1"
                        />
                        <span className="w-8 text-right">{weights[key]}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  ※ 이 점수는 YouTube 공식 데이터가 아니며, 자체 산출한 분석입니다.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {BREAKDOWN_LABELS.map(({ key, label, max }) => (
                  <div key={key} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{label}</span>
                      <span>
                        {analysis.breakdown[key]} / {max}
                      </span>
                    </div>
                    <Progress value={(analysis.breakdown[key] / max) * 100} />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-3">
                <div>표본 영상 수: {numberFormat.format(analysis.stats.videoCount)}개</div>
                <div>중앙값 조회수: {numberFormat.format(analysis.stats.medianViewCount)}회</div>
                <div>상위 10% 조회수: {numberFormat.format(analysis.stats.top10PercentViewCount)}회</div>
                <div>평균 참여율: {percentFormat.format(analysis.stats.avgEngagementRate)}</div>
                <div>최근 90일 비율: {percentFormat.format(analysis.stats.recentRatio)}</div>
                <div>경쟁 채널 중앙값 구독자: {numberFormat.format(analysis.stats.medianChannelSubscriberCount)}명</div>
              </div>

              {tierCounts && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedTiers(new Set())}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      selectedTiers.size === 0 ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground",
                    )}
                  >
                    전체 {analysis.topVideos.length}
                  </button>
                  {PERFORMANCE_TIER_ORDER.map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => toggleTier(tier)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium",
                        selectedTiers.has(tier) ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground",
                      )}
                    >
                      {tier === "explosive" ? "🔥 " : ""}
                      {PERFORMANCE_TIER_LABELS[tier]} {tierCounts[tier]}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {MIN_VIEW_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setMinViewFilter(o.value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      minViewFilter === o.value ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              <div>
                <p className="mb-1 text-sm font-medium">상위 영상 미리보기</p>
                <div className="rounded-lg border">
                  {filteredTopVideos.length === 0 ? (
                    <p className="p-4 text-center text-sm text-muted-foreground">조건에 맞는 영상이 없습니다.</p>
                  ) : (
                    filteredTopVideos.map((v, i) => (
                      <TopVideoRow key={v.videoId} video={v} rank={i + 1} onOpenModal={openModal} />
                    ))
                  )}
                </div>
              </div>

              {analysis.relatedTopics.length > 0 && (
                <div className="rounded-lg border p-3">
                  <p className="mb-1 text-sm font-medium">추천 키워드/태그</p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    상위 영상 20개의 제목/태그 빈도를 분석하여 관련 키워드와 태그를 추천합니다.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {analysis.relatedTopics.map((topic) => (
                      <span key={topic.term} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                        {topic.term} ×{topic.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <textarea
              value={bulkKeywords}
              onChange={(e) => setBulkKeywords(e.target.value)}
              placeholder={"한 줄에 하나씩 입력 (최대 10개)\n예:\n자기계발\n다이어트\n재테크"}
              rows={5}
              className="w-full max-w-md rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
            />
            <Button onClick={runBulkAnalysis} disabled={bulkLoading} className="w-fit">
              {bulkLoading ? "분석 중..." : "복수 키워드 분석"}
            </Button>
          </div>

          {bulkError && <p className="text-sm text-destructive">{bulkError}</p>}

          {bulkResults && bulkResults.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">키워드</th>
                    <th className="p-2 text-right">종합 기회 점수</th>
                    <th className="p-2 text-right">추천 점수</th>
                    <th className="p-2 text-right">검색량 점수</th>
                    <th className="p-2 text-right">경쟁도</th>
                    <th className="p-2 text-right">표본 수</th>
                  </tr>
                </thead>
                <tbody>
                  {[...bulkResults]
                    .sort((a, b) => b.opportunityScore.total - a.opportunityScore.total)
                    .map((r) => (
                      <tr key={r.keyword} className="border-t">
                        <td className="p-2 font-medium">{r.keyword}</td>
                        <td className="p-2 text-right font-semibold text-primary">{r.opportunityScore.total}</td>
                        <td className="p-2 text-right">{r.recommendScore}</td>
                        <td className="p-2 text-right">{r.searchVolumeScore}</td>
                        <td className="p-2 text-right">{percentFormat.format(r.competitionRatio)}</td>
                        <td className="p-2 text-right">{r.stats.videoCount}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
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
