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
import type { SourceDiscoveryResult } from "@/server/services/source-discovery.service";

const numberFormat = new Intl.NumberFormat("ko-KR");

const REGIONS = [
  { value: "US", label: "미국" },
  { value: "GB", label: "영국" },
  { value: "JP", label: "일본" },
  { value: "DE", label: "독일" },
  { value: "BR", label: "브라질" },
  { value: "IN", label: "인도" },
];

export function SourceDiscoveryClient() {
  const [concept, setConcept] = useState("");
  const [region, setRegion] = useState("US");
  const [excludeKorean, setExcludeKorean] = useState(true);
  const [result, setResult] = useState<SourceDiscoveryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [savedVideoIds, setSavedVideoIds] = useState<Set<string>>(new Set());

  const runSearch = () => {
    const trimmed = concept.trim();
    if (!trimmed) {
      setError("컨셉을 입력하세요.");
      return;
    }
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ concept: trimmed, region, excludeKorean: String(excludeKorean) });
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

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="예: 한국 진돗개 키우는 외국인"
          className="max-w-sm"
        />
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REGIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={excludeKorean} onCheckedChange={(v) => setExcludeKorean(Boolean(v))} />
          한국 콘텐츠 제외
        </label>
        <Button onClick={runSearch} disabled={loading}>
          {loading ? "발굴 중..." : "발굴 시작"}
        </Button>
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
                  <div className="aspect-video bg-muted">
                    {video.snippet.thumbnails?.medium?.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={video.snippet.thumbnails.medium.url}
                        alt={video.snippet.title}
                        className="size-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-1 px-2 pb-2">
                    <span className="w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      매치 {video.matchScore}점
                    </span>
                    <p className="line-clamp-2 text-sm font-medium" title={video.snippet.title}>
                      {video.snippet.title}
                    </p>
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
