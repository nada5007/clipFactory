"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { KeywordScoreResult } from "@/lib/keyword-score";

const numberFormat = new Intl.NumberFormat("ko-KR");
const percentFormat = new Intl.NumberFormat("ko-KR", { style: "percent", maximumFractionDigits: 1 });

type Analysis = KeywordScoreResult & { keyword: string };

const BREAKDOWN_LABELS: { key: keyof Analysis["breakdown"]; label: string; max: number }[] = [
  { key: "viewScore", label: "조회수", max: 40 },
  { key: "recencyScore", label: "최신성", max: 20 },
  { key: "engagementScore", label: "참여율", max: 20 },
  { key: "competitionScore", label: "경쟁도(낮을수록 유리)", max: 20 },
];

export function KeywordScorePanel() {
  const [keyword, setKeyword] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = () => {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setError("키워드를 입력하세요.");
      return;
    }
    setLoading(true);
    setError(null);

    fetch(`/api/insight/explore/keyword-score?${new URLSearchParams({ keyword: trimmed }).toString()}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "키워드 시장성을 분석하지 못했습니다.");
        setAnalysis(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "키워드 시장성을 분석하지 못했습니다."))
      .finally(() => setLoading(false));
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">이 키워드의 시장성</h2>
        <p className="text-sm text-muted-foreground">
          검색 결과 상위 영상의 조회수·최신성·참여율·경쟁 채널 규모를 종합해 0~100점으로 산출합니다
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runAnalysis()}
          placeholder="예: 자기계발"
          className="max-w-sm"
        />
        <Button onClick={runAnalysis} disabled={loading}>
          {loading ? "분석 중..." : "분석"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {analysis && (
        <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">{analysis.score}</span>
            <span className="text-sm text-muted-foreground">/ 100점 — &ldquo;{analysis.keyword}&rdquo;</span>
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
    </div>
  );
}
