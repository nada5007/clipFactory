"use client";

import { useState } from "react";

import { VideoDetailModal } from "@/components/insight/video-analysis/video-detail-modal";
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
import { cn } from "@/lib/utils";
import {
  ALL_REGION_CODES,
  DATE_RANGE_OPTIONS,
  LANGUAGE_OPTIONS,
  LENGTH_OPTIONS,
  MIN_VIEW_OPTIONS,
  REGION_GROUPS,
  SORT_OPTIONS,
  type DateRangeFilter,
  type LengthFilter,
  type MinViewFilter,
  type SortOption,
} from "@/lib/source-discovery-options";
import type { SourceDiscoveryResult } from "@/server/services/source-discovery.service";

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

export function SourceDiscoveryClient() {
  const [concept, setConcept] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [translateTitlesOn, setTranslateTitlesOn] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set());
  const [length, setLength] = useState<LengthFilter>("ALL");
  const [dateRange, setDateRange] = useState<DateRangeFilter>("ALL");
  const [minViewCount, setMinViewCount] = useState<MinViewFilter>(0);
  const [sort, setSort] = useState<SortOption>("MATCH");
  const [excludeKorean, setExcludeKorean] = useState(true);

  const [result, setResult] = useState<SourceDiscoveryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [savedVideoIds, setSavedVideoIds] = useState<Set<string>>(new Set());

  const toggleInSet = (set: Set<string>, setter: (next: Set<string>) => void, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  const runSearch = () => {
    const trimmed = concept.trim();
    if (!trimmed) {
      setError("컨셉을 입력하세요.");
      return;
    }
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      concept: trimmed,
      excludeKorean: String(excludeKorean),
      length,
      dateRange,
      minViewCount: String(minViewCount),
      sort,
      translateTitles: String(translateTitlesOn),
    });
    if (selectedRegions.size > 0) params.set("regions", Array.from(selectedRegions).join(","));
    if (selectedLanguages.size > 0) params.set("languages", Array.from(selectedLanguages).join(","));

    fetch(`/api/insight/source-discovery?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "소스 발굴에 실패했습니다.");
        setResult(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "소스 발굴에 실패했습니다."))
      .finally(() => setLoading(false));
  };

  const saveVideo = (video: SourceDiscoveryResult["videos"][number]) => {
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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">소스 발굴</h2>
        <p className="text-sm text-muted-foreground">
          컨셉 한 줄을 입력하면 해외 YouTube 영상을 검색하고, 컨셉과의 일치도(매치 점수)를 AI로 산정합니다
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="채널 컨셉 입력 (예: 한국 진돗개 키우는 외국인)"
            className="max-w-sm"
          />
          <Button type="button" variant="outline" onClick={() => setOptionsOpen((v) => !v)}>
            옵션 {optionsOpen ? "▲" : "▼"}
          </Button>
          <Button onClick={runSearch} disabled={loading} className="ml-auto">
            {loading ? "발굴 중..." : "발굴 시작"}
          </Button>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={translateTitlesOn} onCheckedChange={(v) => setTranslateTitlesOn(Boolean(v))} />
          제목 자동 번역
        </label>

        {optionsOpen && (
          <div className="flex flex-col gap-4 border-t pt-3">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">지역 (다중 선택)</span>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => setSelectedRegions(new Set(ALL_REGION_CODES))}
                  >
                    전체 선택
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground underline"
                    onClick={() => setSelectedRegions(new Set())}
                  >
                    전체 해제
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {REGION_GROUPS.map((group) => (
                  <div key={group.group} className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs text-muted-foreground">{group.group}</span>
                    {group.regions.map((region) => (
                      <Chip
                        key={region.code}
                        selected={selectedRegions.has(region.code)}
                        onClick={() => toggleInSet(selectedRegions, setSelectedRegions, region.code)}
                      >
                        {region.label}
                      </Chip>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">언어</p>
              <div className="flex flex-wrap gap-1.5">
                {LANGUAGE_OPTIONS.map((lang) => (
                  <Chip
                    key={lang.code}
                    selected={selectedLanguages.has(lang.code)}
                    onClick={() => toggleInSet(selectedLanguages, setSelectedLanguages, lang.code)}
                  >
                    {lang.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">길이</p>
                <Select value={length} onValueChange={(v) => setLength(v as LengthFilter)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LENGTH_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">게시일</p>
                <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRangeFilter)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_RANGE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">최소 조회수</p>
                <Select value={String(minViewCount)} onValueChange={(v) => setMinViewCount(Number(v) as MinViewFilter)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MIN_VIEW_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">정렬</p>
                <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={excludeKorean} onCheckedChange={(v) => setExcludeKorean(Boolean(v))} />
              한국 콘텐츠 제외 (기본 ON — 해외 채널 중심 발굴)
            </label>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <>
          <p className="text-xs text-muted-foreground">
            {numberFormat.format(result.candidateCount)}개 결과 · 동일 컨셉·옵션은 24시간 캐시됩니다
          </p>

          {loading ? null : result.videos.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              결과가 없습니다. 컨셉을 더 구체적으로(또는 더 일반적으로) 바꾸거나, 한국 콘텐츠 제외를 꺼보세요.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {result.videos.map((video) => (
                <div key={video.id} className="flex flex-col gap-2 overflow-hidden rounded-lg border bg-card">
                  <a
                    href={`https://www.youtube.com/watch?v=${video.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group relative block aspect-video bg-muted"
                    title="유튜브에서 원본 영상 재생"
                  >
                    {video.snippet.thumbnails?.medium?.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={video.snippet.thumbnails.medium.url}
                        alt={video.snippet.title}
                        className="size-full object-cover"
                      />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                      <span className="flex size-11 items-center justify-center rounded-full bg-black/60 text-lg text-white opacity-0 transition-opacity group-hover:opacity-100">
                        ▶
                      </span>
                    </span>
                  </a>
                  <div className="flex flex-col gap-1 px-2 pb-2">
                    <span className="w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      매치 {video.matchScore}점
                    </span>
                    <a
                      href={`https://www.youtube.com/watch?v=${video.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="line-clamp-2 text-sm font-medium hover:text-primary hover:underline"
                      title={video.snippet.title}
                    >
                      {video.snippet.title}
                    </a>
                    {video.translatedTitle && (
                      <p className="line-clamp-2 text-xs text-primary" title={video.translatedTitle}>
                        {video.translatedTitle}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">{video.snippet.channelTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      조회수 {numberFormat.format(Number(video.statistics.viewCount ?? 0))}회
                    </p>
                    {video.matchReason && (
                      <p className="line-clamp-2 text-xs text-muted-foreground" title={video.matchReason}>
                        {video.matchReason}
                      </p>
                    )}
                    <div className="mt-1 flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setSelectedVideoId(video.id)}>
                        분석
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={savedVideoIds.has(video.id)}
                        onClick={() => saveVideo(video)}
                      >
                        {savedVideoIds.has(video.id) ? "저장됨" : "저장"}
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
