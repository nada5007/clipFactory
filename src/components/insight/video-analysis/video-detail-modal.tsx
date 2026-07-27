"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { GeneratedScript, GeneratedVideoIdeas } from "@/lib/clients/anthropic";
import { formatDurationLabel } from "@/lib/duration";
import { PERFORMANCE_TIER_LABELS } from "@/lib/explore-options";
import { formatRevenueLabel, formatVphLabel } from "@/lib/performance-tier";
import { cn } from "@/lib/utils";
import type { VideoAnalysisDetail } from "@/server/services/video-analysis.service";

const numberFormat = new Intl.NumberFormat("ko-KR");
const percentFormat = new Intl.NumberFormat("ko-KR", { style: "percent", maximumFractionDigits: 0 });

const TABS = [
  { key: "overview", label: "개요" },
  { key: "stats", label: "통계" },
  { key: "captions", label: "자막" },
  { key: "comments", label: "댓글" },
  { key: "seo", label: "SEO" },
  { key: "similar", label: "유사영상" },
  { key: "thumbnail", label: "썸네일" },
  { key: "channel", label: "채널정보" },
  { key: "ideas", label: "AI 아이디어" },
  { key: "script-pattern", label: "대본 패턴" },
  { key: "summary-analysis", label: "종합 분석" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function VideoDetailModal({
  videoUrl,
  open,
  onOpenChange,
  initialTab = "overview",
}: {
  videoUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: TabKey;
}) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [detail, setDetail] = useState<VideoAnalysisDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ideas, setIdeas] = useState<GeneratedVideoIdeas | null>(null);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [savedIdeaIndexes, setSavedIdeaIndexes] = useState<Set<number>>(new Set());

  const [scriptPattern, setScriptPattern] = useState<GeneratedScript | null>(null);
  const [scriptPatternLoading, setScriptPatternLoading] = useState(false);
  const [scriptPatternError, setScriptPatternError] = useState<string | null>(null);

  const saveIdea = (idea: GeneratedVideoIdeas["ideas"][number], index: number) => {
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
          sourceVideoTitle: detail?.video.title,
        },
      }),
    }).then((res) => {
      if (res.ok) setSavedIdeaIndexes((prev) => new Set(prev).add(index));
    });
  };

  useEffect(() => {
    if (!open || !videoUrl) return;
    setTab(initialTab);
    setDetail(null);
    setError(null);
    setIdeas(null);
    setIdeasError(null);
    setSavedIdeaIndexes(new Set());
    setScriptPattern(null);
    setScriptPatternError(null);
    setLoading(true);

    fetch(`/api/insight/video-analysis?${new URLSearchParams({ url: videoUrl }).toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "영상을 분석하지 못했습니다.");
        setDetail(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "영상을 분석하지 못했습니다."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, videoUrl]);

  const runIdeaGeneration = () => {
    if (!detail) return;
    setIdeasLoading(true);
    setIdeasError(null);

    fetch("/api/insight/video-analysis/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: detail.video.title,
        description: detail.video.description,
        commentSummary: detail.comments.summary ?? undefined,
      }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "아이디어를 생성하지 못했습니다.");
        setIdeas(body);
      })
      .catch((e) => setIdeasError(e instanceof Error ? e.message : "아이디어를 생성하지 못했습니다."))
      .finally(() => setIdeasLoading(false));
  };

  const runScriptPatternGeneration = () => {
    if (!detail) return;
    setScriptPatternLoading(true);
    setScriptPatternError(null);

    fetch("/api/insight/video-analysis/script-pattern", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: detail.video.title, description: detail.video.description }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "대본 패턴을 생성하지 못했습니다.");
        setScriptPattern(body);
      })
      .catch((e) => setScriptPatternError(e instanceof Error ? e.message : "대본 패턴을 생성하지 못했습니다."))
      .finally(() => setScriptPatternLoading(false));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{detail?.video.title ?? "영상 분석"}</DialogTitle>
        </DialogHeader>

        {loading && <p className="py-8 text-center text-sm text-muted-foreground">분석 중...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {detail && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-1 border-b">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "shrink-0 border-b-2 px-2 py-1.5 text-xs font-medium transition-colors",
                    tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <div className="flex flex-col gap-2 text-sm">
                <p className="text-muted-foreground">{detail.video.channelTitle}</p>
                <p className="whitespace-pre-wrap">{detail.video.description.slice(0, 500)}</p>
                <p className="text-xs text-muted-foreground">길이 {formatDurationLabel(detail.video.duration)}</p>
              </div>
            )}

            {tab === "stats" && (
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">조회수</p>
                  <p className="font-medium">{numberFormat.format(detail.video.viewCount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">좋아요</p>
                  <p className="font-medium">{numberFormat.format(detail.video.likeCount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">댓글</p>
                  <p className="font-medium">{numberFormat.format(detail.video.commentCount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">태그 개수</p>
                  <p className="font-medium">{detail.video.tags.length}개</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">설명 글자수</p>
                  <p className="font-medium">{detail.video.description.length}자</p>
                </div>
              </div>
            )}

            {tab === "captions" && (
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                <p>YouTube에서 자막(스크립트)을 복사하는 방법:</p>
                <ol className="list-decimal pl-5">
                  <li>아래 링크로 YouTube에서 영상을 엽니다.</li>
                  <li>설명란의 &quot;더보기&quot;를 클릭합니다.</li>
                  <li>&quot;스크립트 표시&quot;를 클릭하면 자막 전문이 표시됩니다.</li>
                </ol>
                <a
                  href={`https://www.youtube.com/watch?v=${detail.video.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-fit rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                >
                  YouTube에서 영상 열기
                </a>
              </div>
            )}

            {tab === "comments" &&
              (detail.comments.error ? (
                <p className="text-sm text-muted-foreground">댓글을 분석하지 못했습니다: {detail.comments.error}</p>
              ) : !detail.comments.insight ? (
                <p className="text-sm text-muted-foreground">분석할 댓글이 없습니다.</p>
              ) : (
                <div className="flex flex-col gap-4 text-sm">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">분석 댓글</p>
                      <p className="text-lg font-semibold">{numberFormat.format(detail.comments.sampleSize)}개</p>
                    </div>
                    <div className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">유니크 작성자</p>
                      <p className="text-lg font-semibold">{numberFormat.format(detail.comments.insight.uniqueAuthorCount)}명</p>
                    </div>
                    <div className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">댓글 총 좋아요</p>
                      <p className="text-lg font-semibold">{numberFormat.format(detail.comments.insight.totalLikeCount)}</p>
                    </div>
                    <div className="rounded-md border p-2">
                      <p className="text-xs text-muted-foreground">긍정 비율</p>
                      <p className="text-lg font-semibold text-emerald-600">{percentFormat.format(detail.comments.insight.positiveRatio)}</p>
                    </div>
                  </div>

                  <div>
                    <div className="flex h-3 overflow-hidden rounded-full">
                      <div className="bg-emerald-500" style={{ width: percentFormat.format(detail.comments.insight.positiveRatio) }} />
                      <div className="bg-muted-foreground/30" style={{ width: percentFormat.format(detail.comments.insight.neutralRatio) }} />
                      <div className="bg-destructive" style={{ width: percentFormat.format(detail.comments.insight.negativeRatio) }} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      긴장·반어·풍자는 키워드 기반 자동 분류라 정확도가 낮을 수 있어요. 참고용 지표입니다.
                    </p>
                  </div>

                  {detail.comments.insight.topInsights.length > 0 && (
                    <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <p className="text-xs font-semibold text-primary">🔥 핵심 인사이트 — 각 카테고리 좋아요 1위 댓글</p>
                      {detail.comments.insight.topInsights.map(({ intent, comment, suggestion }) => (
                        <div key={intent} className="rounded-md bg-background p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{intent}</span>
                            <span className="text-xs text-muted-foreground">👍 {numberFormat.format(comment.likeCount)}</span>
                          </div>
                          <p className="mt-1">{comment.text}</p>
                          <p className="mt-0.5 text-xs text-primary">→ {suggestion}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {detail.comments.frequentQuestions.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">자주 나오는 질문</p>
                      <ul className="text-sm text-muted-foreground">
                        {detail.comments.frequentQuestions.map((q) => (
                          <li key={q}>· {q}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {detail.comments.insight.activeDiscussions.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        💬 활발한 토론 (답글 5+ 댓글)
                      </p>
                      <div className="flex flex-col divide-y rounded-lg border">
                        {detail.comments.insight.activeDiscussions.map((c, i) => (
                          <div key={i} className="p-2">
                            <p>{c.text}</p>
                            <p className="text-xs text-muted-foreground">
                              @{c.author} · 좋아요 {numberFormat.format(c.likeCount)} · 답글 {numberFormat.format(c.replyCount)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">인기 댓글</p>
                    <div className="flex flex-col divide-y rounded-lg border">
                      {detail.comments.insight.popularComments.map((c, i) => (
                        <div key={i} className="p-2">
                          <span className="mr-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{c.intent}</span>
                          <p className="mt-1">{c.text}</p>
                          <p className="text-xs text-muted-foreground">
                            @{c.author} · 좋아요 {numberFormat.format(c.likeCount)}
                            {c.replyCount > 0 ? ` · 답글 ${numberFormat.format(c.replyCount)}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

            {tab === "seo" && (
              <div className="flex flex-col gap-4">
                <p className="text-sm font-medium">{detail.seo.total} / 100 SEO 점수</p>

                {detail.video.tags.length > 0 && (
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground">실제 태그</p>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(detail.video.tags.join(", "))}
                        className="text-xs text-primary hover:underline"
                      >
                        전체 태그 복사 →
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {detail.video.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {detail.seo.items.map((item) => (
                    <div key={item.key} className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{item.label} — {item.detail}</span>
                        <span>
                          {item.score} / {item.max}
                        </span>
                      </div>
                      <Progress value={(item.score / item.max) * 100} />
                    </div>
                  ))}
                </div>

                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">베스트 프랙티스</p>
                  <ul className="flex flex-col gap-1">
                    {detail.seo.bestPractices.map((bp) => (
                      <li key={bp.key} className="flex items-center gap-2">
                        <span className={bp.passed ? "text-emerald-600" : "text-destructive"}>{bp.passed ? "✓" : "✗"}</span>
                        {bp.label}
                      </li>
                    ))}
                  </ul>
                </div>

                {detail.seo.suggestions.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">AI 개선 제안</p>
                    <ul className="flex flex-col gap-1 text-muted-foreground">
                      {detail.seo.suggestions.map((s) => (
                        <li key={s}>· {s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  SEO 점수는 영상 메타데이터를 자체 산출한 분석이며, YouTube 공식 지표가 아닙니다.
                </p>
              </div>
            )}

            {tab === "similar" && (
              <div className="flex flex-col divide-y rounded-lg border text-sm">
                {detail.similarVideos.length === 0 ? (
                  <p className="p-2 text-muted-foreground">유사 영상이 없습니다.</p>
                ) : (
                  detail.similarVideos.map((v) => (
                    <a
                      key={v.id}
                      href={`https://www.youtube.com/watch?v=${v.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-3 p-2 hover:bg-muted"
                    >
                      <span className="line-clamp-1 text-primary hover:underline">{v.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {v.channelTitle} · {numberFormat.format(v.viewCount)}회
                      </span>
                    </a>
                  ))
                )}
              </div>
            )}

            {tab === "thumbnail" && (
              <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted">
                {detail.video.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={detail.video.thumbnailUrl} alt={detail.video.title} className="size-full object-cover" />
                )}
              </div>
            )}

            {tab === "channel" &&
              (detail.channel ? (
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">채널</p>
                    <p className="font-medium">{detail.channel.title}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">구독자</p>
                    <p className="font-medium">{numberFormat.format(detail.channel.subscriberCount)}명</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">총 영상 수</p>
                    <p className="font-medium">{numberFormat.format(detail.channel.videoCount)}개</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">채널 정보를 불러오지 못했습니다.</p>
              ))}

            {tab === "ideas" && (
              <div className="flex flex-col gap-3">
                <Button onClick={runIdeaGeneration} disabled={ideasLoading} className="w-fit">
                  {ideasLoading ? "생성 중..." : ideas ? "다시 생성" : "이 소재로 아이디어 5개 생성"}
                </Button>
                {ideasError && <p className="text-sm text-destructive">{ideasError}</p>}
                {ideas?.ideas.map((idea, i) => (
                  <div key={i} className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
                    <p className="font-medium">{idea.title}</p>
                    <p className="text-xs text-muted-foreground">훅: {idea.hook}</p>
                    <p className="text-xs text-muted-foreground">차별화: {idea.differentiator}</p>
                    {idea.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {idea.keywords.map((k) => (
                          <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 w-fit"
                      disabled={savedIdeaIndexes.has(i)}
                      onClick={() => saveIdea(idea, i)}
                    >
                      {savedIdeaIndexes.has(i) ? "저장됨" : "저장"}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {tab === "script-pattern" && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  이 영상의 훅 구조·흐름을 분석해 같은 주제를 내 스타일로 재해석한 새 대본을 생성합니다.
                </p>
                <Button onClick={runScriptPatternGeneration} disabled={scriptPatternLoading} className="w-fit">
                  {scriptPatternLoading ? "생성 중..." : scriptPattern ? "다시 생성" : "대본 패턴 생성"}
                </Button>
                {scriptPatternError && <p className="text-sm text-destructive">{scriptPatternError}</p>}
                {scriptPattern && (
                  <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
                    <p className="font-medium">{scriptPattern.title}</p>
                    <p className="text-xs text-muted-foreground">후킹: {scriptPattern.hook}</p>
                    <p className="whitespace-pre-wrap">{scriptPattern.body}</p>
                    {scriptPattern.imagePrompts.length > 0 && (
                      <div className="flex flex-col gap-1 pt-1">
                        <p className="text-xs font-medium text-muted-foreground">이미지 프롬프트</p>
                        {scriptPattern.imagePrompts.map((prompt, i) => (
                          <p key={i} className="text-xs text-muted-foreground">
                            {i + 1}. {prompt}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === "summary-analysis" && (
              <div className="flex flex-col gap-4 text-sm">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">조회수</p>
                    <p className="text-lg font-semibold">{numberFormat.format(detail.video.viewCount)}</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">시간당 조회수</p>
                    <p className="text-lg font-semibold">{formatVphLabel(detail.performance.vph)}</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">성과 등급</p>
                    <p className="text-lg font-semibold">{PERFORMANCE_TIER_LABELS[detail.performance.tier]}</p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">예상 수익(KRW)</p>
                    <p className="text-lg font-semibold">{formatRevenueLabel(detail.performance.estimatedRevenueKrw)}</p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  좋아요 {numberFormat.format(detail.video.likeCount)} · 댓글 {numberFormat.format(detail.video.commentCount)}
                  {detail.video.isShort ? (
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-primary">쇼츠</span>
                  ) : null}
                </p>

                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">챕터</p>
                  {detail.chapters.length === 0 ? (
                    <p className="text-xs text-muted-foreground">챕터 타임스탬프가 없거나 인식되지 않았습니다.</p>
                  ) : (
                    <div className="flex flex-col divide-y rounded-lg border">
                      {detail.chapters.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 text-xs">
                          <span className="shrink-0 font-mono text-muted-foreground">{c.timestamp}</span>
                          <span>{c.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {detail.sameChannelVideos.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      같은 채널 인기 영상 ({detail.sameChannelVideos.length}개)
                    </p>
                    <div className="flex flex-col divide-y rounded-lg border">
                      {detail.sameChannelVideos.map((v) => (
                        <a
                          key={v.id}
                          href={`https://www.youtube.com/watch?v=${v.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-2 p-2 text-xs hover:bg-muted"
                        >
                          <span className="line-clamp-1 text-primary hover:underline">{v.title}</span>
                          <span className="shrink-0 text-muted-foreground">{numberFormat.format(v.viewCount)}회</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {detail.similarVideos.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      유사 컨셉 영상 ({detail.similarVideos.length}개) — &ldquo;{detail.similarVideosSearchTerm}&rdquo;
                    </p>
                    <div className="flex flex-col divide-y rounded-lg border">
                      {detail.similarVideos.map((v) => (
                        <a
                          key={v.id}
                          href={`https://www.youtube.com/watch?v=${v.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between gap-2 p-2 text-xs hover:bg-muted"
                        >
                          <span className="line-clamp-1 text-primary hover:underline">{v.title}</span>
                          <span className="shrink-0 text-muted-foreground">{numberFormat.format(v.viewCount)}회</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  VPH·성과 등급·예상 수익은 자체 산출한 파생 지표이며 YouTube 공식 지표가 아닙니다.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
