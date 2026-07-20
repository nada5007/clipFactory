"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { GeneratedVideoIdeas } from "@/lib/clients/anthropic";
import { cn } from "@/lib/utils";
import type { VideoAnalysisDetail } from "@/server/services/video-analysis.service";

const numberFormat = new Intl.NumberFormat("ko-KR");
const percentFormat = new Intl.NumberFormat("ko-KR", { style: "percent", maximumFractionDigits: 0 });

function formatDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return iso;
  const [, h, m, s] = match;
  const seconds = (s ?? "0").padStart(2, "0");
  return h ? `${h}:${(m ?? "0").padStart(2, "0")}:${seconds}` : `${m ?? "0"}:${seconds}`;
}

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
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function VideoDetailModal({
  videoUrl,
  open,
  onOpenChange,
}: {
  videoUrl: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [detail, setDetail] = useState<VideoAnalysisDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ideas, setIdeas] = useState<GeneratedVideoIdeas | null>(null);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [savedIdeaIndexes, setSavedIdeaIndexes] = useState<Set<number>>(new Set());

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
    setTab("overview");
    setDetail(null);
    setError(null);
    setIdeas(null);
    setIdeasError(null);
    setSavedIdeaIndexes(new Set());
    setLoading(true);

    fetch(`/api/insight/video-analysis?${new URLSearchParams({ url: videoUrl }).toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "영상을 분석하지 못했습니다.");
        setDetail(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "영상을 분석하지 못했습니다."))
      .finally(() => setLoading(false));
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
        commentSummary: detail.comments.analysis?.summary,
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
                <p className="text-xs text-muted-foreground">길이 {formatDuration(detail.video.duration)}</p>
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
              ) : !detail.comments.analysis ? (
                <p className="text-sm text-muted-foreground">분석할 댓글이 없습니다.</p>
              ) : (
                <div className="flex flex-col gap-3 text-sm">
                  <p className="text-xs text-muted-foreground">
                    분석 댓글 수 {numberFormat.format(detail.comments.sampleSize)}개 · 키워드 기반 자동 분류라 반어·풍자 정확도는 낮을 수 있어요
                  </p>
                  <div className="flex h-3 overflow-hidden rounded-full">
                    <div className="bg-emerald-500" style={{ width: percentFormat.format(detail.comments.analysis.positiveRatio) }} />
                    <div className="bg-muted-foreground/30" style={{ width: percentFormat.format(detail.comments.analysis.neutralRatio) }} />
                    <div className="bg-destructive" style={{ width: percentFormat.format(detail.comments.analysis.negativeRatio) }} />
                  </div>
                  <p>{detail.comments.analysis.summary}</p>
                  <div className="flex flex-wrap gap-1">
                    {detail.comments.analysis.keywordClusters.map((k) => (
                      <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              ))}

            {tab === "seo" && (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">{detail.seo.total} / 100 SEO 점수</p>
                {detail.seo.items.map((item) => (
                  <div key={item.key} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{item.label}</span>
                      <span>
                        {item.score} / {item.max}
                      </span>
                    </div>
                    <Progress value={(item.score / item.max) * 100} />
                  </div>
                ))}
              </div>
            )}

            {tab === "similar" && (
              <div className="flex flex-col divide-y rounded-lg border text-sm">
                {detail.similarVideos.length === 0 ? (
                  <p className="p-2 text-muted-foreground">유사 영상이 없습니다.</p>
                ) : (
                  detail.similarVideos.map((v) => (
                    <div key={v.id.videoId} className="flex items-center justify-between gap-3 p-2">
                      <span className="line-clamp-1">{v.snippet.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{v.snippet.channelTitle}</span>
                    </div>
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
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
