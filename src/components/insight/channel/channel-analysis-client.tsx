"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChannelScanReport } from "@/server/services/channel-analysis.service";

const numberFormat = new Intl.NumberFormat("ko-KR");
const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function youtubeWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function VideoThumb({ thumbnailUrl, title, videoId }: { thumbnailUrl?: string; title: string; videoId?: string }) {
  const inner = (
    <div className="relative aspect-video w-full overflow-hidden rounded bg-muted">
      {thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnailUrl} alt={title} className="size-full object-cover" />
      )}
      {videoId && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
          <span className="flex size-9 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
            ▶
          </span>
        </span>
      )}
    </div>
  );

  if (!videoId) return inner;
  return (
    <a
      href={youtubeWatchUrl(videoId)}
      target="_blank"
      rel="noreferrer"
      className="group block"
      title="유튜브에서 원본 영상 재생"
    >
      {inner}
    </a>
  );
}

function Heatmap({ heatmap }: { heatmap: ChannelScanReport["analysis"]["heatmap"] }) {
  const maxAvg = Math.max(1, ...heatmap.map((c) => c.avgViewCount));
  const lookup = new Map(heatmap.map((c) => [`${c.dayOfWeek}-${c.hour}`, c]));

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-[2rem_repeat(24,1fr)] gap-0.5 text-[10px] text-muted-foreground">
        <div />
        {HOURS.map((h) => (
          <div key={h} className="text-center">
            {h}
          </div>
        ))}
        {DAY_LABELS.map((label, dayOfWeek) => (
          <div key={label} className="contents">
            <div className="flex items-center">{label}</div>
            {HOURS.map((hour) => {
              const cell = lookup.get(`${dayOfWeek}-${hour}`);
              const intensity = cell ? cell.avgViewCount / maxAvg : 0;
              return (
                <div
                  key={hour}
                  title={cell ? `${DAY_LABELS[dayOfWeek]}요일 ${hour}시 — 영상 ${cell.videoCount}개, 평균 ${numberFormat.format(Math.round(cell.avgViewCount))}회` : "데이터 없음"}
                  className="aspect-square rounded-sm"
                  style={{ backgroundColor: `rgba(99, 102, 241, ${Math.max(0.06, intensity)})` }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChannelAnalysisClient() {
  const [input, setInput] = useState("");
  const [report, setReport] = useState<ChannelScanReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelSaved, setChannelSaved] = useState(false);

  const saveChannel = () => {
    if (!report) return;
    fetch("/api/saved-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "CHANNEL",
        snapshot: {
          channelId: report.channel.id,
          title: report.channel.snippet.title,
          subscriberCount: Number(report.channel.statistics.subscriberCount ?? 0),
          videoCount: report.totalUploadCount,
          viewCount: Number(report.channel.statistics.viewCount ?? 0),
        },
      }),
    }).then((res) => {
      if (res.ok) setChannelSaved(true);
    });
  };

  const runScan = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError("채널 URL, ID, 핸들 또는 이름을 입력하세요.");
      return;
    }
    setLoading(true);
    setError(null);
    setChannelSaved(false);

    fetch(`/api/insight/channel/scan?${new URLSearchParams({ channel: trimmed }).toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "채널을 분석하지 못했습니다.");
        setReport(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "채널을 분석하지 못했습니다."))
      .finally(() => setLoading(false));
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">채널 분석</h2>
        <p className="text-sm text-muted-foreground">
          채널 URL, ID 또는 @핸들을 입력하면 TOP 영상·전체 영상 스캔·업로드 골든타임·썸네일을 분석합니다
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runScan()}
          placeholder="예: @veritasium 또는 채널 URL"
          className="max-w-sm"
        />
        <Button onClick={runScan} disabled={loading}>
          {loading ? "분석 중..." : "분석"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {report && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">채널</p>
                <p className="font-medium">{report.channel.snippet.title}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">구독자</p>
                <p className="font-medium">{numberFormat.format(Number(report.channel.statistics.subscriberCount ?? 0))}명</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">총 영상 수</p>
                <p className="font-medium">{numberFormat.format(report.totalUploadCount)}개</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">총 조회수</p>
                <p className="font-medium">{numberFormat.format(Number(report.channel.statistics.viewCount ?? 0))}회</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="w-fit" disabled={channelSaved} onClick={saveChannel}>
              {channelSaved ? "채널 저장됨" : "채널 저장"}
            </Button>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">인기 영상 TOP 10</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {report.analysis.topVideos.map((video) => (
                <div key={video.videoId} className="flex flex-col gap-1 overflow-hidden rounded-lg border bg-card">
                  <VideoThumb thumbnailUrl={video.thumbnailUrl} title={video.title} videoId={video.videoId} />
                  <div className="flex flex-col gap-0.5 px-2 pb-2">
                    <a
                      href={youtubeWatchUrl(video.videoId)}
                      target="_blank"
                      rel="noreferrer"
                      className="line-clamp-2 text-xs font-medium hover:text-primary hover:underline"
                      title={video.title}
                    >
                      {video.title}
                    </a>
                    <p className="text-[11px] text-muted-foreground">
                      조회수 {numberFormat.format(video.viewCount)}회
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">
              전체 영상 스캔 — 최근 {numberFormat.format(report.scannedCount)}개 중 median 대비 3배 이상 떡상 {report.analysis.surgedVideos.length}개
            </h3>
            <p className="mb-2 text-xs text-muted-foreground">
              중앙값 조회수 {numberFormat.format(report.analysis.medianViewCount)}회
            </p>
            {report.analysis.surgedVideos.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">median 대비 3배 이상 떡상한 영상이 없습니다.</p>
            ) : (
              <div className="flex flex-col divide-y rounded-lg border">
                {report.analysis.surgedVideos.map((video) => (
                  <a
                    key={video.videoId}
                    href={youtubeWatchUrl(video.videoId)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 p-2 text-sm hover:bg-muted"
                    title="유튜브에서 원본 영상 재생"
                  >
                    <span className="line-clamp-1 hover:text-primary" title={video.title}>
                      {video.title}
                    </span>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {video.ratio.toFixed(1)}배 · {numberFormat.format(video.viewCount)}회
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">골든 업로드 시간대 (KST, 요일×시간)</h3>
            {report.analysis.heatmap.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">히트맵을 만들 데이터가 부족합니다.</p>
            ) : (
              <Heatmap heatmap={report.analysis.heatmap} />
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">썸네일 그리드 (조회수 순)</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {report.analysis.videos.map((video) => (
                <VideoThumb key={video.videoId} thumbnailUrl={video.thumbnailUrl} title={video.title} videoId={video.videoId} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
