"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Segment = { startMs: number; endMs: number; reason: string };
type SourceVideo = { videoId: string; url: string; title: string };
type HighlightMeta = { transcriptSource?: string; cueCount?: number; targetDurationSec?: number; analyzedAt?: string };

function mmss(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function HighlightPanel({ projectId }: { projectId: string }) {
  const [sourceVideo, setSourceVideo] = useState<SourceVideo | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [meta, setMeta] = useState<HighlightMeta | null>(null);

  const [manualTranscript, setManualTranscript] = useState("");
  const [targetSec, setTargetSec] = useState("");

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildResult, setBuildResult] = useState<{ clipCount: number; totalDurationMs: number } | null>(null);

  const loadSettings = useCallback(() => {
    fetch(`/api/projects/${projectId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((p) => {
        const s = (p?.settings ?? {}) as { sourceVideo?: SourceVideo; highlightSegments?: Segment[]; highlightMeta?: HighlightMeta };
        setSourceVideo(s.sourceVideo ?? null);
        setSegments(s.highlightSegments ?? []);
        setMeta(s.highlightMeta ?? null);
      });
  }, [projectId]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const runAnalyze = () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    const body: { manualTranscript?: string; targetDurationSec?: number } = {};
    if (manualTranscript.trim()) body.manualTranscript = manualTranscript;
    const t = Number(targetSec);
    if (Number.isFinite(t) && t > 0) body.targetDurationSec = t;

    fetch(`/api/projects/${projectId}/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "하이라이트 분석에 실패했습니다.");
        setSegments(data.segments ?? []);
        setMeta({ transcriptSource: data.transcriptSource, cueCount: data.cueCount, targetDurationSec: data.targetDurationSec });
        setBuildResult(null);
      })
      .catch((e) => setAnalyzeError(e instanceof Error ? e.message : "하이라이트 분석에 실패했습니다."))
      .finally(() => setAnalyzing(false));
  };

  const runBuild = () => {
    setBuilding(true);
    setBuildError(null);
    fetch(`/api/projects/${projectId}/build-highlight-track`, { method: "POST" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "영상 트랙 생성에 실패했습니다.");
        setBuildResult(data);
      })
      .catch((e) => setBuildError(e instanceof Error ? e.message : "영상 트랙 생성에 실패했습니다."))
      .finally(() => setBuilding(false));
  };

  if (!sourceVideo) {
    return (
      <p className="py-8 text-sm text-muted-foreground">
        이 프로젝트에는 채널 분석 소스 영상이 연결되어 있지 않습니다. 채널 분석에서 &lsquo;프로젝트 생성&rsquo;으로 만든
        프로젝트에서만 하이라이트 자동 편집을 쓸 수 있습니다.
      </p>
    );
  }

  const totalSelectedSec = Math.round(segments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0) / 1000);

  return (
    <div className="flex flex-col gap-5">
      {/* 원본 영상 */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs text-muted-foreground">원본 영상</p>
        <a href={sourceVideo.url} target="_blank" rel="noreferrer" className="font-medium hover:text-primary hover:underline">
          {sourceVideo.title || sourceVideo.url}
        </a>
        <p className="mt-2 rounded bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400">
          ⚠️ 다운로드·재가공 대상 영상의 권리·이용약관 책임은 사용자에게 있습니다. 본인 소유/라이선스 영상 사용을 전제로
          하며, 원본을 그대로 재업로드하기보다 변형·논평·요약 등 트랜스포머티브 편집 + 출처 표기를 권장합니다.
        </p>
      </div>

      {/* Phase 2: 하이라이트 분석 */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold">1단계 · 하이라이트 구간 분석</h3>
          <p className="text-xs text-muted-foreground">
            원본 영상의 자동자막을 읽어 흥미 구간을 AI가 선정합니다. 자동자막이 없거나 직접 넣고 싶으면 아래에 자막/타임스탬프를
            붙여넣으세요(예: <code>0:12 텍스트</code> 또는 VTT/SRT).
          </p>
        </div>
        <Textarea
          value={manualTranscript}
          onChange={(e) => setManualTranscript(e.target.value)}
          placeholder="(선택) 자막/타임스탬프 직접 붙여넣기 — 비우면 유튜브 자동자막을 사용합니다"
          rows={4}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={targetSec}
            onChange={(e) => setTargetSec(e.target.value)}
            placeholder="목표 길이(초, 비우면 자동)"
            className="w-56"
            inputMode="numeric"
          />
          <Button onClick={runAnalyze} disabled={analyzing}>
            {analyzing ? "분석 중..." : "하이라이트 분석"}
          </Button>
        </div>
        {analyzeError && <p className="text-sm text-destructive">{analyzeError}</p>}

        {segments.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">
              선정 구간 {segments.length}개 · 합계 약 {totalSelectedSec}초
              {meta?.transcriptSource ? ` · 자막출처: ${meta.transcriptSource === "manual" ? "직접 입력" : "자동자막"}` : ""}
            </p>
            <div className="flex flex-col divide-y rounded-lg border">
              {segments.map((s, i) => (
                <div key={i} className="flex items-center gap-3 p-2 text-sm">
                  <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {mmss(s.startMs)}~{mmss(s.endMs)}
                  </span>
                  <span className="line-clamp-1 text-muted-foreground">{s.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Phase 3a: 영상 트랙 생성 */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold">2단계 · 선정 구간으로 영상 트랙 만들기</h3>
          <p className="text-xs text-muted-foreground">
            원본 영상을 내려받아 위에서 선정된 구간을 잘라 타임라인의 VIDEO 트랙으로 구성합니다(기존 자동 생성분은 교체).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={runBuild} disabled={building || segments.length === 0}>
            {building ? "생성 중... (다운로드·컷 시간이 걸릴 수 있음)" : "영상 트랙 만들기"}
          </Button>
          <Link href={`/projects/${projectId}/timeline`} className="text-sm text-primary underline">
            타임라인 편집기 열기 →
          </Link>
        </div>
        {segments.length === 0 && (
          <p className="text-xs text-muted-foreground">먼저 1단계에서 하이라이트 구간을 분석해주세요.</p>
        )}
        {buildError && <p className="text-sm text-destructive">{buildError}</p>}
        {buildResult && (
          <p className="text-sm">
            VIDEO 트랙에 클립 <span className="font-semibold text-primary">{buildResult.clipCount}개</span>(총{" "}
            {Math.round(buildResult.totalDurationMs / 1000)}초)를 구성했습니다. &lsquo;영상&rsquo; 탭 또는 타임라인 편집기에서
            확인하세요.
          </p>
        )}
      </div>
    </div>
  );
}
