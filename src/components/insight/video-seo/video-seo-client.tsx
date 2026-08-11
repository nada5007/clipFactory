"use client";

import { useState } from "react";

import { usePersistedState } from "@/lib/use-persisted-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { VideoSeoReport } from "@/server/services/video-seo.service";

const numberFormat = new Intl.NumberFormat("ko-KR");
const percentFormat = new Intl.NumberFormat("ko-KR", { style: "percent", maximumFractionDigits: 0 });

export function VideoSeoClient() {
  const [url, setUrl] = usePersistedState("insight:videoSeo:url", "");
  const [keyword, setKeyword] = usePersistedState("insight:videoSeo:keyword", "");
  const [report, setReport] = usePersistedState<VideoSeoReport | null>("insight:videoSeo:report", null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("YouTube 영상 URL 또는 ID를 입력하세요.");
      return;
    }
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ url: trimmedUrl });
    if (keyword.trim()) params.set("keyword", keyword.trim());

    fetch(`/api/insight/video-seo?${params.toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "영상을 분석하지 못했습니다.");
        setReport(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "영상을 분석하지 못했습니다."))
      .finally(() => setLoading(false));
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">영상 SEO</h2>
        <p className="text-sm text-muted-foreground">
          타깃 키워드를 입력하면 키워드 적합성 위주로, 비우면 영상 전반을 7가지 항목으로 분석합니다
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runAnalysis()}
          placeholder="YouTube 영상 URL 또는 11자 ID (예: dQw4w9WgXcQ)"
          className="max-w-md"
        />
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runAnalysis()}
          placeholder="타깃 키워드 (선택)"
          className="max-w-xs"
        />
        <Button onClick={runAnalysis} disabled={loading}>
          {loading ? "분석 중..." : "분석"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {report && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{report.video.title}</p>
              <p className="text-xs text-muted-foreground">
                {report.video.channelTitle} · 조회 {numberFormat.format(report.video.viewCount)} · 좋아요{" "}
                {numberFormat.format(report.video.likeCount)} · 댓글 {numberFormat.format(report.video.commentCount)} ·
                설명 {report.video.description.length}자 · 태그 {report.video.tags.length}개
              </p>
              {report.seo.targetKeyword && (
                <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  타깃 키워드: {report.seo.targetKeyword}
                </span>
              )}
            </div>
            <div className="shrink-0 text-right">
              <span className="text-3xl font-bold">{report.seo.total}</span>
              <span className="text-sm text-muted-foreground"> /100 SEO 점수</span>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">항목별 점수</h3>
            <div className="flex flex-col gap-3">
              {report.seo.items.map((item) => (
                <div key={item.key} className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {item.label} — {item.detail}
                    </span>
                    <span>
                      {item.score} / {item.max}
                    </span>
                  </div>
                  <Progress value={(item.score / item.max) * 100} />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold">베스트 프랙티스</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {report.seo.bestPractices.map((bp) => (
                  <li key={bp.key} className="flex items-center gap-2">
                    <span className={bp.passed ? "text-emerald-600" : "text-destructive"}>{bp.passed ? "✓" : "✗"}</span>
                    {bp.label}
                  </li>
                ))}
              </ul>
            </div>

            {report.seo.suggestions.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">개선 제안</h3>
                <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {report.seo.suggestions.map((s) => (
                    <li key={s}>· {s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">댓글 감정 분석</h3>
            {report.comments.error ? (
              <p className="text-sm text-muted-foreground">댓글을 분석하지 못했습니다: {report.comments.error}</p>
            ) : !report.comments.insight ? (
              <p className="text-sm text-muted-foreground">분석할 댓글이 없습니다.</p>
            ) : (
              <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">
                  분석 댓글 수 {numberFormat.format(report.comments.sampleSize)}개 · 키워드 기반 자동 분류라 반어·풍자
                  정확도는 낮을 수 있어요
                </p>
                <div className="flex h-3 overflow-hidden rounded-full">
                  <div className="bg-emerald-500" style={{ width: percentFormat.format(report.comments.insight.positiveRatio) }} />
                  <div className="bg-muted-foreground/30" style={{ width: percentFormat.format(report.comments.insight.neutralRatio) }} />
                  <div className="bg-destructive" style={{ width: percentFormat.format(report.comments.insight.negativeRatio) }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  긍정 {percentFormat.format(report.comments.insight.positiveRatio)} · 중립{" "}
                  {percentFormat.format(report.comments.insight.neutralRatio)} · 부정{" "}
                  {percentFormat.format(report.comments.insight.negativeRatio)}
                </p>
                <p className="text-sm">{report.comments.summary}</p>
                {report.comments.frequentQuestions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">자주 나오는 질문</p>
                    <ul className="text-sm text-muted-foreground">
                      {report.comments.frequentQuestions.map((q) => (
                        <li key={q}>· {q}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {report.similarVideos.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">유사 컨셉 영상 — &ldquo;{report.similarVideosSearchTerm}&rdquo;</h3>
              <div className="flex flex-col divide-y rounded-lg border">
                {report.similarVideos.map((video) => (
                  <a
                    key={video.id}
                    href={`https://www.youtube.com/watch?v=${video.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 p-2 text-sm hover:bg-muted"
                  >
                    <span className="line-clamp-1 text-primary hover:underline" title={video.title}>
                      {video.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {video.channelTitle} · {numberFormat.format(video.viewCount)}회
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {report.sameChannelVideos.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">같은 채널 인기 영상</h3>
              <div className="flex flex-col divide-y rounded-lg border">
                {report.sameChannelVideos.map((video) => (
                  <a
                    key={video.id}
                    href={`https://www.youtube.com/watch?v=${video.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 p-2 text-sm hover:bg-muted"
                  >
                    <span className="line-clamp-1 text-primary hover:underline" title={video.title}>
                      {video.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{numberFormat.format(video.viewCount)}회</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
