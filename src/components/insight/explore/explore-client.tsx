"use client";

import { useCallback, useEffect, useState } from "react";

import { KeywordScorePanel } from "@/components/insight/explore/keyword-score-panel";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { YoutubeVideo } from "@/lib/clients/youtube";

const REGIONS = [
  { value: "KR", label: "한국" },
  { value: "US", label: "미국" },
  { value: "JP", label: "일본" },
  { value: "GB", label: "영국" },
];

const CATEGORIES = [
  { value: "ALL", label: "전체 카테고리" },
  { value: "1", label: "영화 및 애니메이션" },
  { value: "10", label: "음악" },
  { value: "15", label: "애완동물 및 동물" },
  { value: "17", label: "스포츠" },
  { value: "20", label: "게임" },
  { value: "22", label: "사람 및 블로그" },
  { value: "23", label: "코미디" },
  { value: "24", label: "엔터테인먼트" },
  { value: "25", label: "뉴스 및 정치" },
  { value: "26", label: "노하우 및 스타일" },
  { value: "27", label: "교육" },
  { value: "28", label: "과학 및 기술" },
];

const numberFormat = new Intl.NumberFormat("ko-KR");

export function ExploreClient() {
  const [mode, setMode] = useState<"browse" | "analyze">("browse");
  const [region, setRegion] = useState("KR");
  const [category, setCategory] = useState("ALL");
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVideos = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ region });
    if (category !== "ALL") params.set("category", category);

    fetch(`/api/insight/explore/popular?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "인기 영상을 불러오지 못했습니다.");
        setVideos(body.items ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "인기 영상을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [region, category]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  return (
    <div className="flex flex-col gap-4">
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

      {mode === "analyze" ? (
        <KeywordScorePanel />
      ) : (
        <>
      <div>
        <h2 className="text-lg font-semibold">지금 인기 영상</h2>
        <p className="text-sm text-muted-foreground">지역·카테고리별 YouTube 인기 영상을 확인합니다</p>
      </div>

      <div className="flex gap-3">
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

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">불러오는 중...</div>
      ) : videos.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">결과가 없습니다.</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {videos.map((video) => (
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
                <p className="line-clamp-2 text-sm font-medium" title={video.snippet.title}>
                  {video.snippet.title}
                </p>
                <p className="text-xs text-muted-foreground">{video.snippet.channelTitle}</p>
                <p className="text-xs text-muted-foreground">
                  조회수 {numberFormat.format(Number(video.statistics.viewCount ?? 0))}회
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}
