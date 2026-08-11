"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { usePersistedState } from "@/lib/use-persisted-state";
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
import { VideoDetailModal } from "@/components/insight/video-analysis/video-detail-modal";
import type { SurgePatternAnalysis } from "@/lib/clients/anthropic";
import { EXPLORE_CATEGORIES, REGION_OPTIONS, VIDEO_FORM_OPTIONS, type VideoForm } from "@/lib/explore-options";
import { NICHE_CATALOG } from "@/lib/niche-catalog";
import {
  SUBSCRIBER_CAP_DEFAULT,
  SUBSCRIBER_CAP_OPTIONS,
  SURGE_DEFAULT_THRESHOLD,
  SURGE_PERIOD_OPTIONS,
  SURGE_THRESHOLD_OPTIONS,
  type SurgePeriod,
} from "@/lib/surge-options";
import { cn } from "@/lib/utils";
import type { SurgeMode, SurgeSearchResult } from "@/server/services/surge.service";

const numberFormat = new Intl.NumberFormat("ko-KR");

const MODE_TABS: { value: SurgeMode; label: string }[] = [
  { value: "category", label: "채널 단위 (카테고리)" },
  { value: "keyword", label: "영상 단위 (작은 채널 발굴)" },
  { value: "channel", label: "채널 ID" },
];

const MODE_DEFAULT_PERIOD: Record<SurgeMode, SurgePeriod> = {
  category: "7d",
  keyword: "30d",
  channel: "all",
};

export function SurgeClient() {
  const searchParams = useSearchParams();

  // 다른 페이지로 이동했다가 돌아와도 조건·결과가 유지되도록 보관한다.
  const [mode, setMode] = usePersistedState<SurgeMode>("insight:surge:mode", "keyword");
  const [region, setRegion] = usePersistedState("insight:surge:region", "KR");
  const [category, setCategory] = usePersistedState("insight:surge:category", "ALL");
  const [seedKeyword, setSeedKeyword] = usePersistedState("insight:surge:seedKeyword", "");
  const [keyword, setKeyword] = usePersistedState("insight:surge:keyword", "");
  const [channelId, setChannelId] = usePersistedState("insight:surge:channelId", "");
  const [threshold, setThreshold] = usePersistedState("insight:surge:threshold", SURGE_DEFAULT_THRESHOLD);
  const [videoForm, setVideoForm] = usePersistedState<VideoForm>("insight:surge:videoForm", "all");
  const [period, setPeriod] = usePersistedState<SurgePeriod>("insight:surge:period", MODE_DEFAULT_PERIOD.keyword);
  const [hiddenGemEnabled, setHiddenGemEnabled] = usePersistedState("insight:surge:hiddenGem", false);
  const [subscriberCap, setSubscriberCap] = usePersistedState("insight:surge:subscriberCap", SUBSCRIBER_CAP_DEFAULT);

  const [result, setResult] = usePersistedState<SurgeSearchResult | null>("insight:surge:result", null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [patternAnalysis, setPatternAnalysis] = usePersistedState<SurgePatternAnalysis | null>("insight:surge:pattern", null);
  const [patternLoading, setPatternLoading] = useState(false);
  const [patternError, setPatternError] = useState<string | null>(null);

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [savedVideoIds, setSavedVideoIds] = useState<Set<string>>(new Set());

  const switchMode = (m: SurgeMode) => {
    setMode(m);
    setPeriod(MODE_DEFAULT_PERIOD[m]);
    setResult(null);
    setError(null);
    setPatternAnalysis(null);
  };

  const runSearch = (overrides?: { mode?: SurgeMode; keyword?: string; seedKeyword?: string }) => {
    const m = overrides?.mode ?? mode;

    const params = new URLSearchParams({ mode: m, threshold: String(threshold), videoForm, period });
    if (hiddenGemEnabled && m !== "channel") {
      params.set("hiddenGem", "true");
      params.set("subscriberCap", String(subscriberCap));
    }

    if (m === "keyword") {
      const kw = (overrides?.keyword ?? keyword).trim();
      if (!kw) {
        setError("키워드를 입력하세요.");
        return;
      }
      params.set("keyword", kw);
      params.set("region", region);
      if (category !== "ALL") params.set("category", category);
    } else if (m === "category") {
      params.set("region", region);
      if (category !== "ALL") params.set("category", category);
      const sk = (overrides?.seedKeyword ?? seedKeyword).trim();
      if (sk) params.set("seedKeyword", sk);
    } else {
      const cid = channelId.trim();
      if (!cid) {
        setError("채널 ID를 입력하세요.");
        return;
      }
      params.set("channelId", cid);
    }

    setLoading(true);
    setError(null);
    setPatternAnalysis(null);

    fetch(`/api/insight/surge?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "떡상 영상을 찾지 못했습니다.");
        setResult(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "떡상 영상을 찾지 못했습니다."))
      .finally(() => setLoading(false));
  };

  // UI_SPEC.md §7.1 "홈" "빠른 떡상 발굴": 니치 칩 클릭 시 ?keyword=로 넘어와 영상 단위 모드로 자동 검색된다.
  useEffect(() => {
    const presetKeyword = searchParams.get("keyword");
    if (presetKeyword) {
      setMode("keyword");
      setKeyword(presetKeyword);
      runSearch({ mode: "keyword", keyword: presetKeyword });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectNiche = (niche: string) => {
    setSeedKeyword(niche);
    runSearch({ mode: "category", seedKeyword: niche });
  };

  const saveVideo = (video: SurgeSearchResult["videos"][number]) => {
    fetch("/api/saved-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "VIDEO",
        snapshot: {
          videoId: video.videoId,
          title: video.title,
          channelTitle: video.channelTitle,
          viewCount: video.viewCount,
          ratio: video.ratio,
        },
      }),
    }).then((res) => {
      if (res.ok) setSavedVideoIds((prev) => new Set(prev).add(video.videoId));
    });
  };

  const runPatternAnalysis = () => {
    if (!result || result.videos.length === 0) return;
    setPatternLoading(true);
    setPatternError(null);

    fetch("/api/insight/surge/pattern-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videos: result.videos }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "패턴을 분석하지 못했습니다.");
        setPatternAnalysis(body);
      })
      .catch((e) => setPatternError(e instanceof Error ? e.message : "패턴을 분석하지 못했습니다."))
      .finally(() => setPatternLoading(false));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">떡상 영상 발굴</h2>
          <p className="text-sm text-muted-foreground">자기 채널 평균(median) 대비 몇 배 떡상했는지 분석합니다</p>
        </div>
        <div className="flex gap-1 rounded-lg border bg-muted p-1 w-fit">
          {MODE_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => switchMode(t.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                mode === t.value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {mode === "category" && (
        <p className="text-xs text-muted-foreground">
          국가/카테고리만 선택하면 해당 시장 상위 인기 채널들의 떡상 영상을 한번에 분석합니다.
        </p>
      )}
      {mode === "keyword" && (
        <p className="text-xs text-muted-foreground">
          키워드로 영상을 직접 검색해서 각 영상이 자기 채널 평균 대비 몇 배 떡상했는지 분석합니다. 작은 채널의 폭증 영상도 발굴 가능
        </p>
      )}
      {mode === "channel" && (
        <p className="text-xs text-muted-foreground">
          채널 분석 탭에서 채널 ID를 복사하여 입력하거나, 채널 카드의 &quot;떡상 보기&quot; 버튼을 사용하세요.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {mode !== "channel" && (
            <Select value={region} onValueChange={setRegion}>
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
          )}

          {mode === "category" && (
            <>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPLORE_CATEGORIES.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={seedKeyword}
                onChange={(e) => setSeedKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="시드 키워드 (선택, 예: AI 에이전트)"
                className="max-w-xs"
              />
            </>
          )}

          {mode === "keyword" && (
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="키워드 입력 (예: 부동산, AI 에이전트, 다이어트)"
              className="max-w-xs"
            />
          )}

          {mode === "channel" && (
            <Input
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="채널 ID 입력 (예: UCHnyfMqiRRG1u-2MsSQLbXA)"
              className="max-w-sm"
            />
          )}

          <Select value={String(threshold)} onValueChange={(v) => setThreshold(Number(v))}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SURGE_THRESHOLD_OPTIONS.map((t) => (
                <SelectItem key={t.value} value={String(t.value)}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={videoForm} onValueChange={(v) => setVideoForm(v as VideoForm)}>
            <SelectTrigger className="w-44">
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

          <Select value={period} onValueChange={(v) => setPeriod(v as SurgePeriod)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SURGE_PERIOD_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {mode !== "channel" && (
            <label className="flex items-center gap-1.5 whitespace-nowrap text-sm">
              <Checkbox checked={hiddenGemEnabled} onCheckedChange={(v) => setHiddenGemEnabled(Boolean(v))} />
              💎 숨겨진 보석
            </label>
          )}

          <Button onClick={() => runSearch()} disabled={loading}>
            {loading ? "발굴 중..." : mode === "keyword" ? "영상 떡상 발굴" : "떡상 발굴"}
          </Button>
        </div>

        {mode !== "channel" && hiddenGemEnabled && (
          <Select value={String(subscriberCap)} onValueChange={(v) => setSubscriberCap(Number(v))}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBSCRIBER_CAP_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {mode === "category" && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">빠른 진입 (한국형 서브카테고리):</p>
            <div className="flex flex-wrap gap-1.5">
              {NICHE_CATALOG.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => selectNiche(n)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    seedKeyword === n ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:text-foreground",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode !== "category" && (
          <p className="text-xs text-muted-foreground">
            ※ 신뢰도: 채널 표본 5개 미만이면 결과에서 제외 · 영상 조회수 1천 미만은 노이즈로 제외
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <>
          {result.videos.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{numberFormat.format(result.videos.length)}개 결과</p>
              <Button variant="outline" size="sm" onClick={runPatternAnalysis} disabled={patternLoading}>
                {patternLoading ? "분석 중..." : "🔍 패턴 분석"}
              </Button>
            </div>
          )}

          {patternError && <p className="text-sm text-destructive">{patternError}</p>}

          {patternAnalysis && (
            <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
              <p className="font-medium">패턴 분석 결과</p>
              <p>{patternAnalysis.summary}</p>
              <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <p>업로드 시간대: {patternAnalysis.uploadTimePattern}</p>
                <p>길이 경향: {patternAnalysis.lengthPattern}</p>
                <p>주제 공통점: {patternAnalysis.topicPattern}</p>
              </div>
              {patternAnalysis.commonHooks.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {patternAnalysis.commonHooks.map((h) => (
                    <span key={h} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {h}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {loading ? null : result.videos.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              조건을 만족하는 떡상 영상이 없습니다. 기간을 넓히거나 배수를 낮춰보세요.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {result.videos.map((video) => (
                <div key={video.videoId} className="flex flex-col gap-2 overflow-hidden rounded-lg border bg-card">
                  <a
                    href={`https://www.youtube.com/watch?v=${video.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-video bg-muted"
                  >
                    {video.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={video.thumbnailUrl} alt={video.title} className="size-full object-cover" />
                    )}
                  </a>
                  <div className="flex flex-col gap-1 px-2 pb-2">
                    <div className="flex flex-wrap gap-1">
                      <span className="w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        {video.ratio.toFixed(1)}배 떡상
                      </span>
                      {video.isRisingStar && (
                        <span className="w-fit rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600">
                          🌱 신생 강자
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-sm font-medium" title={video.title}>
                      {video.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{video.channelTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      조회수 {numberFormat.format(video.viewCount)}회 · 채널 평균{" "}
                      {numberFormat.format(Math.round(video.channelMedianViewCount))}회
                    </p>
                    <div className="mt-1 flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setSelectedVideoId(video.videoId)}>
                        분석
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={savedVideoIds.has(video.videoId)}
                        onClick={() => saveVideo(video)}
                      >
                        {savedVideoIds.has(video.videoId) ? "저장됨" : "저장"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <VideoDetailModal
        videoUrl={selectedVideoId}
        open={selectedVideoId !== null}
        onOpenChange={(open) => !open && setSelectedVideoId(null)}
      />
    </div>
  );
}
