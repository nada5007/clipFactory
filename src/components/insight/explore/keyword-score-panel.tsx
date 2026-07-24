"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { BulkKeywordAnalysis, KeywordMarketAnalysis } from "@/server/services/explore.service";

const numberFormat = new Intl.NumberFormat("ko-KR");
const percentFormat = new Intl.NumberFormat("ko-KR", { style: "percent", maximumFractionDigits: 1 });

type Analysis = KeywordMarketAnalysis;

const BREAKDOWN_LABELS: { key: keyof Analysis["breakdown"]; label: string; max: number }[] = [
  { key: "viewScore", label: "조회수", max: 40 },
  { key: "recencyScore", label: "최신성", max: 20 },
  { key: "engagementScore", label: "참여율", max: 20 },
  { key: "competitionScore", label: "경쟁도(낮을수록 유리)", max: 20 },
];

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

  const runAnalysis = (explicitKeyword?: string) => {
    const trimmed = (explicitKeyword ?? keyword).trim();
    if (!trimmed) {
      setError("키워드를 입력하세요.");
      return;
    }
    setLoading(true);
    setError(null);
    setRelatedKeywords(null);

    fetch(`/api/insight/explore/keyword-score?${new URLSearchParams({ keyword: trimmed }).toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "키워드 시장성을 분석하지 못했습니다.");
        setAnalysis(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "키워드 시장성을 분석하지 못했습니다."))
      .finally(() => setLoading(false));
  };

  // UI_SPEC.md §7.1 "탐색·분석": 결과 하단 "핵심 토픽" 클릭 시 분석 모드로 재검색되며 자동 실행된다.
  useEffect(() => {
    if (seedKeyword) {
      setKeyword(seedKeyword);
      runSearchImmediate(seedKeyword);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKeyword]);

  function runSearchImmediate(k: string) {
    runAnalysis(k);
  }

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

          {analysis && (
            <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{analysis.recommendScore}</span>
                  <span className="text-sm text-muted-foreground">/ 100점 추천 — &ldquo;{analysis.keyword}&rdquo;</span>
                </div>
                <Link
                  href={`/analytics/surge?keyword=${encodeURIComponent(analysis.keyword)}`}
                  className="shrink-0 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                >
                  떡상 영상 키워드 모드로 재검색 →
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-2">
                <div className="rounded-md bg-muted p-2">
                  <p className="text-muted-foreground">검색량 점수</p>
                  <p className="text-base font-semibold">{analysis.searchVolumeScore} / 100</p>
                </div>
                <div className="rounded-md bg-muted p-2">
                  <p className="text-muted-foreground">경쟁도 {analysis.competitionRatio >= 0.7 ? "(이미 포화)" : ""}</p>
                  <p className="text-base font-semibold">{percentFormat.format(analysis.competitionRatio)}</p>
                </div>
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
            </div>
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
                    <th className="p-2 text-right">추천 점수</th>
                    <th className="p-2 text-right">검색량 점수</th>
                    <th className="p-2 text-right">경쟁도</th>
                    <th className="p-2 text-right">표본 수</th>
                  </tr>
                </thead>
                <tbody>
                  {[...bulkResults]
                    .sort((a, b) => b.recommendScore - a.recommendScore)
                    .map((r) => (
                      <tr key={r.keyword} className="border-t">
                        <td className="p-2 font-medium">{r.keyword}</td>
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
    </div>
  );
}
