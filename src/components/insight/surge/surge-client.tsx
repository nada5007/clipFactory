"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VideoDetailModal } from "@/components/insight/video-analysis/video-detail-modal";
import type { SurgeSearchResult } from "@/server/services/surge.service";

const numberFormat = new Intl.NumberFormat("ko-KR");

const THRESHOLDS = [
  { value: "1.5", label: "1.5배 (느슨)" },
  { value: "2", label: "2배" },
  { value: "3", label: "3배" },
  { value: "5", label: "5배 (기본)" },
];

const PERIODS = [
  { value: "7", label: "최근 7일" },
  { value: "30", label: "최근 30일 (기본)" },
  { value: "90", label: "최근 90일" },
];

export function SurgeClient() {
  const [keyword, setKeyword] = useState("");
  const [threshold, setThreshold] = useState("5");
  const [days, setDays] = useState("30");
  const [result, setResult] = useState<SurgeSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [savedVideoIds, setSavedVideoIds] = useState<Set<string>>(new Set());

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

  const runSearch = () => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setError("키워드를 입력하세요.");
      return;
    }
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ keyword: trimmed, threshold, days });
    fetch(`/api/insight/surge?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "떡상 영상을 찾지 못했습니다.");
        setResult(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "떡상 영상을 찾지 못했습니다."))
      .finally(() => setLoading(false));
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">떡상 영상 발굴</h2>
        <p className="text-sm text-muted-foreground">
          키워드로 영상을 검색해서 각 영상이 자기 채널 평균(median) 대비 몇 배 떡상했는지 분석합니다. 작은 채널의
          폭증 영상도 발굴 가능
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="예: 다이어트"
          className="max-w-sm"
        />
        <Select value={threshold} onValueChange={setThreshold}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THRESHOLDS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                평균 {t.label} 이상
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={runSearch} disabled={loading}>
          {loading ? "발굴 중..." : "영상 떡상 발굴"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <>
          <p className="text-xs text-muted-foreground">
            신뢰도: 채널 표본 5개 미만이면 결과에서 제외 · 영상 조회수 1천 미만은 노이즈로 제외
          </p>

          {loading ? null : result.videos.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              조건을 만족하는 떡상 영상이 없습니다. 기간을 넓히거나 배수를 낮춰보세요.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {result.videos.map((video) => (
                <div key={video.videoId} className="flex flex-col gap-2 overflow-hidden rounded-lg border bg-card">
                  <div className="aspect-video bg-muted">
                    {video.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={video.thumbnailUrl} alt={video.title} className="size-full object-cover" />
                    )}
                  </div>
                  <div className="flex flex-col gap-1 px-2 pb-2">
                    <span className="w-fit rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      {video.ratio.toFixed(1)}배 떡상
                    </span>
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
