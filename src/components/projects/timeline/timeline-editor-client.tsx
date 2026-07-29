"use client";

import Link from "next/link";
import { ArrowLeft, Maximize2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { ScriptPanel } from "@/components/projects/detail/script-panel";
import { TimelineTracks } from "@/components/projects/timeline/timeline-tracks";
import { useJobProgress } from "@/hooks/use-job-progress";
import {
  analyzeSubtitleLineLength,
  computeTimelineStats,
  RECOMMENDED_SUBTITLE_CHARS_PER_LINE,
  validateTimeline,
  type PersistedTimeline,
  type PersistedTimelineClip,
  type TimelineValidationResult,
} from "@/lib/timeline";
import { cn } from "@/lib/utils";
import type { SerializedProject, SerializedVideoAsset } from "@/types/project";

type LeftTab = "script" | "subtitle" | "preview" | "final";

const LEFT_TABS: { key: LeftTab; label: string }[] = [
  { key: "script", label: "스크립트" },
  { key: "subtitle", label: "자막" },
  { key: "preview", label: "미리보기" },
  { key: "final", label: "완성본" },
];

const SHORTCUTS: { key: string; label: string }[] = [
  { key: "Space", label: "재생/일시정지" },
  { key: "Ctrl + 휠", label: "줌 인/아웃" },
  { key: "Home / End", label: "처음/끝으로" },
  { key: "Ctrl+S", label: "저장" },
  { key: "Ctrl+Z / Ctrl+Y", label: "실행 취소/다시 실행" },
];

const RIGHT_PANEL_DEFAULT_WIDTH = 288;
const RIGHT_PANEL_MIN_WIDTH = 220;
const RIGHT_PANEL_MAX_WIDTH = 560;

type TimingSnapshot = { id: string; startMs: number; endMs: number }[];

function snapshotTimings(timeline: PersistedTimeline): TimingSnapshot {
  return timeline.tracks.flatMap((t) => t.clips.map((c) => ({ id: c.id, startMs: c.startMs, endMs: c.endMs })));
}

function applySnapshot(timeline: PersistedTimeline, snapshot: TimingSnapshot): PersistedTimeline {
  const byId = new Map(snapshot.map((s) => [s.id, s]));
  return {
    ...timeline,
    tracks: timeline.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => {
        const s = byId.get(c.id);
        return s ? { ...c, startMs: s.startMs, endMs: s.endMs } : c;
      }),
    })),
  };
}

function patchClipInTimeline(
  timeline: PersistedTimeline,
  clipId: string,
  patch: Partial<Pick<PersistedTimelineClip, "startMs" | "endMs" | "payload">>,
): PersistedTimeline {
  return {
    ...timeline,
    tracks: timeline.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
    })),
  };
}

function findClip(timeline: PersistedTimeline | null, clipId: string | null) {
  if (!timeline || !clipId) return null;
  for (const track of timeline.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

export function TimelineEditorClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<SerializedProject | null>(null);
  const [video, setVideo] = useState<SerializedVideoAsset | null>(null);
  const [timeline, setTimeline] = useState<PersistedTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [activeTab, setActiveTab] = useState<LeftTab>("script");
  const [zoom, setZoom] = useState(100);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapIntervalMs, setSnapIntervalMs] = useState(100);
  const [dismissedLints, setDismissedLints] = useState<Set<string>>(new Set());
  const [validation, setValidation] = useState<TimelineValidationResult | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { job, start } = useJobProgress(projectId, "RENDER");

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [textDraft, setTextDraft] = useState("");
  const [savingText, setSavingText] = useState(false);
  const [history, setHistory] = useState<TimingSnapshot[]>([]);
  const [future, setFuture] = useState<TimingSnapshot[]>([]);

  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_DEFAULT_WIDTH);
  const draggingRef = useRef(false);

  // 좌측 콘텐츠 영역 ↔ 우측 속성/품질 분석 패널 사이 너비를 마우스 드래그로 조절한다.
  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setRightPanelWidth(Math.min(RIGHT_PANEL_MAX_WIDTH, Math.max(RIGHT_PANEL_MIN_WIDTH, newWidth)));
    }
    function handleMouseUp() {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  function handleDividerMouseDown() {
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [projectRes, videoRes, timelineRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/render`),
        fetch(`/api/projects/${projectId}/timeline`),
      ]);

      setProject(projectRes.ok ? await projectRes.json() : null);
      setVideo(videoRes.ok ? await videoRes.json() : null);
      setTimeline(timelineRes.ok ? await timelineRes.json() : null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // 원본(스크립트/이미지/BGM)이 다른 화면에서 바뀌었을 수 있으니 재동기화로 최신 상태를 반영한다.
  // 삭제/생성이 발생할 수 있어 클립 id 기반 실행취소 스택은 더 이상 유효하지 않을 수 있으므로 비운다.
  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/sync`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "동기화에 실패했습니다.");
      setTimeline(await res.json());
      setHistory([]);
      setFuture([]);
      setSelectedClipId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "동기화에 실패했습니다.");
    } finally {
      setSyncing(false);
    }
  }

  const stats = useMemo(() => (timeline ? computeTimelineStats(timeline) : null), [timeline]);

  const subtitleClips = useMemo(
    () => timeline?.tracks.find((t) => t.type === "SUBTITLE")?.clips ?? [],
    [timeline],
  );
  const lint = useMemo(
    () => analyzeSubtitleLineLength(subtitleClips.map((c) => ({ id: c.id, text: c.payload.text ?? "" }))),
    [subtitleClips],
  );
  const lintVisible = lint.exceedingIds.length > 0 && !dismissedLints.has("subtitle-line-length");

  const selected = useMemo(() => findClip(timeline, selectedClipId), [timeline, selectedClipId]);
  const hasTextField = selected?.track.type === "SUBTITLE" || selected?.track.type === "TTS";
  const canSplit = selected != null && playheadMs > selected.clip.startMs && playheadMs < selected.clip.endMs;

  useEffect(() => {
    setTextDraft(selected?.clip.payload.text ?? "");
  }, [selected?.clip.id, selected?.clip.payload.text]);

  function handleValidate() {
    if (timeline) setValidation(validateTimeline(timeline));
  }

  // 드래그/트림(타이밍 변경)은 실행취소 대상이므로 커밋 전에 현재 상태를 히스토리에 남긴다.
  const commitClipTiming = useCallback(
    async (clipId: string, startMs: number, endMs: number) => {
      setTimeline((prev) => {
        if (!prev) return prev;
        setHistory((h) => [...h, snapshotTimings(prev)]);
        setFuture([]);
        return patchClipInTimeline(prev, clipId, { startMs, endMs });
      });
      try {
        const res = await fetch(`/api/projects/${projectId}/timeline/clips/${clipId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startMs, endMs }),
        });
        if (res.ok) {
          const updated = await res.json();
          setTimeline((prev) =>
            prev ? patchClipInTimeline(prev, clipId, { startMs: updated.startMs, endMs: updated.endMs }) : prev,
          );
        } else {
          await fetchAll();
        }
      } catch {
        await fetchAll();
      }
    },
    [projectId, fetchAll],
  );

  const handleUndo = useCallback(async () => {
    if (history.length === 0) return;
    const prevSnapshot = history[history.length - 1];
    setTimeline((prev) => {
      if (!prev) return prev;
      setFuture((f) => [...f, snapshotTimings(prev)]);
      return applySnapshot(prev, prevSnapshot);
    });
    setHistory((h) => h.slice(0, -1));
    await fetch(`/api/projects/${projectId}/timeline/clips/bulk`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: prevSnapshot }),
    });
  }, [history, projectId]);

  const handleRedo = useCallback(async () => {
    if (future.length === 0) return;
    const nextSnapshot = future[future.length - 1];
    setTimeline((prev) => {
      if (!prev) return prev;
      setHistory((h) => [...h, snapshotTimings(prev)]);
      return applySnapshot(prev, nextSnapshot);
    });
    setFuture((f) => f.slice(0, -1));
    await fetch(`/api/projects/${projectId}/timeline/clips/bulk`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates: nextSnapshot }),
    });
  }, [future, projectId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  async function handleSaveText() {
    if (!selected) return;
    setSavingText(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/timeline/clips/${selected.clip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textDraft }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTimeline((prev) => (prev ? patchClipInTimeline(prev, selected.clip.id, { payload: updated.payload }) : prev));
      }
    } finally {
      setSavingText(false);
    }
  }

  async function handleSplit() {
    if (!selected || !canSplit) return;
    const res = await fetch(`/api/projects/${projectId}/timeline/clips/${selected.clip.id}/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ atMs: playheadMs }),
    });
    if (res.ok) {
      setHistory([]);
      setFuture([]);
      setSelectedClipId(null);
      await fetchAll();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "분할에 실패했습니다.");
    }
  }

  async function handleDeleteClip() {
    if (!selected) return;
    const res = await fetch(`/api/projects/${projectId}/timeline/clips/${selected.clip.id}`, { method: "DELETE" });
    if (res.ok) {
      setHistory([]);
      setFuture([]);
      setSelectedClipId(null);
      await fetchAll();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "삭제에 실패했습니다.");
    }
  }

  async function handleFixSubtitleLineLength() {
    const res = await fetch(`/api/projects/${projectId}/timeline/quality-fixes/subtitle-line-length`, {
      method: "POST",
    });
    if (res.ok) {
      await fetchAll();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "자막 재구성에 실패했습니다.");
    }
  }

  async function handleRender() {
    setRendering(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/render`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "렌더링에 실패했습니다.");
      }
      start((finalJob) => {
        setRendering(false);
        if (finalJob.status === "SUCCEEDED") {
          fetchAll();
          setActiveTab("final");
        } else {
          setError(finalJob.error ?? "렌더링에 실패했습니다.");
        }
      });
    } catch (e) {
      setRendering(false);
      setError(e instanceof Error ? e.message : "렌더링에 실패했습니다.");
    }
  }

  if (loading || !timeline) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0b0d12] text-sm text-white/70">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#0b0d12] text-white">
      {/* 상단 툴바 1행 */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2">
        <Link href={`/projects/${projectId}`} className="text-white/60 hover:text-white">
          <ArrowLeft className="size-4" />
        </Link>
        <span className="truncate text-sm font-medium">🎬 {project?.title ?? "프로젝트"}</span>

        <div className="ml-4 flex items-center gap-1 rounded-md bg-white/5 p-0.5">
          {LEFT_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "rounded px-2.5 py-1 text-xs",
                activeTab === tab.key ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-white/20 text-white"
            onClick={handleUndo}
            disabled={history.length === 0}
          >
            ↶ 실행 취소
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-white/20 text-white"
            onClick={handleRedo}
            disabled={future.length === 0}
          >
            ↷ 다시 실행
          </Button>
          <Button variant="outline" size="sm" className="border-white/20 text-white" onClick={handleValidate}>
            유효성 검사
          </Button>
          <Button variant="outline" size="sm" className="border-white/20 text-white">
            품질 분석 {lint.exceedingIds.length > 0 && `(${lint.exceedingIds.length})`}
          </Button>
          <Button variant="outline" size="sm" className="border-white/10 text-white/30" disabled>
            라이브러리
          </Button>
          <Button variant="outline" size="sm" className="border-white/20 text-white" onClick={handleSync} disabled={syncing}>
            {syncing ? "동기화 중..." : "⟳ 동기화"}
          </Button>
          <Button variant="outline" size="sm" className="border-white/10 text-white/30" disabled title="Phase C 예정">
            ✨ AI 자동 편집
          </Button>
          <Button variant="outline" size="sm" className="border-white/10 text-white/30" disabled title="Phase C 예정">
            🔊 자동 효과음
          </Button>
          <Button size="sm" onClick={handleRender} disabled={rendering}>
            {rendering ? "렌더링 중..." : "⦿ 렌더링"}
          </Button>
        </div>
      </div>

      {/* 상단 툴바 2행 (재생 컨트롤) */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-1.5 text-xs text-white/60">
        <span className="text-white/30">|◀ ▶ ▶|</span>
        <span>속도 1x</span>
        <span>
          {(playheadMs / 1000).toFixed(2)}s / {(timeline.durationMs / 1000).toFixed(2)}s
        </span>
        <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5">
          ⓘ Preview Mode — 애니메이션/전환효과는 렌더링 후 확인
        </span>
        <label className="flex items-center gap-1">
          <Checkbox checked={snapEnabled} onCheckedChange={(v) => setSnapEnabled(Boolean(v))} />
          스냅
        </label>
        <Maximize2 className="size-3.5" />
      </div>

      {rendering && (
        <div className="border-b border-white/10 px-4 py-2">
          <Progress value={job?.progress ?? 0} />
          <p className="mt-1 text-xs text-white/50">{job?.message ?? "준비 중..."}</p>
        </div>
      )}
      {error && <p className="border-b border-white/10 px-4 py-2 text-xs text-destructive">{error}</p>}

      <div className="flex flex-1 overflow-hidden">
        {/* 좌측 콘텐츠 영역 */}
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {activeTab === "script" && (
            <div className="rounded-lg bg-background p-4 text-foreground">
              <ScriptPanel projectId={projectId} />
            </div>
          )}
          {activeTab === "subtitle" && (
            <div className="flex h-full items-center justify-center text-sm text-white/40">
              자막 탭은 다음 라운드(Phase C)에서 지원 예정입니다. 자막 클립은 아래 타임라인에서 선택해 우측
              속성 패널에서 편집할 수 있습니다.
            </div>
          )}
          {activeTab === "preview" && (
            <div className="flex h-full items-center justify-center text-sm text-white/40">
              합성 미리보기는 다음 라운드(Phase C)에서 지원 예정입니다.
            </div>
          )}
          {activeTab === "final" && (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              {video ? (
                <>
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    controls
                    className="max-h-[70vh] rounded-lg"
                    src={`/api/projects/${projectId}/render/file`}
                  />
                  <a href={`/api/projects/${projectId}/render/file`} download>
                    <Button variant="outline" className="border-white/20 text-white">
                      다운로드
                    </Button>
                  </a>
                </>
              ) : (
                <p className="text-sm text-white/40">아직 렌더링된 영상이 없습니다. 상단 렌더링 버튼을 눌러주세요.</p>
              )}
            </div>
          )}
        </div>

        {/* 리사이즈 핸들: 드래그로 좌측 콘텐츠 ↔ 우측 패널 너비 조절 */}
        <div
          onMouseDown={handleDividerMouseDown}
          className="w-1 shrink-0 cursor-col-resize bg-white/5 hover:bg-primary/60 active:bg-primary"
        />

        {/* 우측 컬럼: 품질 분석 + 속성 패널 */}
        <div
          style={{ width: rightPanelWidth }}
          className="flex shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/10 p-3 text-xs"
        >
          {lintVisible && (
            <div className="rounded-md border border-sky-400/40 bg-sky-400/10 p-3">
              <p className="mb-1 flex items-center justify-between font-medium text-sky-200">
                품질 분석 <span>모두 무시</span>
              </p>
              <p className="text-white/80">
                ⚠ 자막 {lint.exceedingIds.length}개의 줄 길이가 {lint.maxLength}자를 초과합니다
              </p>
              <p className="mt-1 text-white/50">
                권장: {RECOMMENDED_SUBTITLE_CHARS_PER_LINE}자/줄 | 현재 최대: {lint.maxLength}자
              </p>
              <p className="mt-1 text-white/50">
                롱폼 한국어 자막은 {RECOMMENDED_SUBTITLE_CHARS_PER_LINE}자/줄이 가장 읽기 좋습니다 (Netflix 기준
                16자, 롱폼 기준)
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" className="border-white/20 text-white" onClick={handleFixSubtitleLineLength}>
                  자동 줄바꿈으로 수정
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white/50"
                  onClick={() => setDismissedLints((prev) => new Set(prev).add("subtitle-line-length"))}
                >
                  무시
                </Button>
              </div>
            </div>
          )}

          {validation && (
            <div
              className={cn(
                "rounded-md border p-3",
                validation.valid ? "border-emerald-400/40 bg-emerald-400/10" : "border-amber-400/40 bg-amber-400/10",
              )}
            >
              {validation.valid ? (
                <p>✓ 타임라인이 유효합니다.</p>
              ) : (
                <ul className="list-disc space-y-1 pl-4">
                  {validation.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-white/40">참고: 최종 렌더링은 1800초로 제한됩니다. 초과하는 구간은 자동으로 잘립니다.</p>
            </div>
          )}

          <div className="space-y-3 rounded-md border border-white/10 p-3">
            <p className="font-medium">속성</p>
            {selected ? (
              <div className="space-y-2">
                <p className="text-white/50">{selected.track.name} 클립</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-white/40">시작(초)</span>
                    <input
                      type="number"
                      step={0.01}
                      className="w-full rounded border border-white/20 bg-white/5 px-1.5 py-1 text-white"
                      value={(selected.clip.startMs / 1000).toFixed(2)}
                      onChange={(e) => {
                        const startMs = Math.round(Number(e.target.value) * 1000);
                        if (Number.isFinite(startMs)) commitClipTiming(selected.clip.id, startMs, selected.clip.endMs);
                      }}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-white/40">종료(초)</span>
                    <input
                      type="number"
                      step={0.01}
                      className="w-full rounded border border-white/20 bg-white/5 px-1.5 py-1 text-white"
                      value={(selected.clip.endMs / 1000).toFixed(2)}
                      onChange={(e) => {
                        const endMs = Math.round(Number(e.target.value) * 1000);
                        if (Number.isFinite(endMs)) commitClipTiming(selected.clip.id, selected.clip.startMs, endMs);
                      }}
                    />
                  </label>
                </div>

                {hasTextField && (
                  <div className="space-y-1">
                    <span className="text-white/40">텍스트</span>
                    <Textarea
                      value={textDraft}
                      onChange={(e) => setTextDraft(e.target.value)}
                      className="min-h-16 border-white/20 bg-white/5 text-white"
                    />
                    <Button size="sm" onClick={handleSaveText} disabled={savingText}>
                      {savingText ? "저장 중..." : "텍스트 저장"}
                    </Button>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="border-white/20 text-white" onClick={handleSplit} disabled={!canSplit}>
                    ✂ 분할(재생헤드)
                  </Button>
                  <Button size="sm" variant="destructive" onClick={handleDeleteClip}>
                    삭제
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-white/40">클립을 선택하세요</p>
                <p className="rounded-md bg-white/5 p-2 text-white/60">
                  클립을 클릭하여 선택하면 해당 클립의 속성을 편집할 수 있습니다. 타임라인의 눈금자를 클릭하면
                  재생헤드를 이동할 수 있습니다.
                </p>
              </>
            )}

            <div>
              <p className="mb-1 font-medium">타임라인 통계</p>
              <div className="grid grid-cols-2 gap-1 text-white/60">
                <span>트랙 {stats?.trackCount ?? 0}개</span>
                <span>총 클립 {stats?.totalClips ?? 0}개</span>
                <span>길이 {(stats?.durationSec ?? 0).toFixed(1)}초</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {(stats?.clipCountsByTrack ?? [])
                  .filter((t) => t.count > 0)
                  .map((t) => (
                    <span key={t.name} className="rounded bg-white/10 px-1.5 py-0.5">
                      {t.name} {t.count}
                    </span>
                  ))}
              </div>
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1.5">
                <Checkbox checked={snapEnabled} onCheckedChange={(v) => setSnapEnabled(Boolean(v))} />
                스냅 활성화
              </label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[snapIntervalMs]}
                  onValueChange={([v]) => setSnapIntervalMs(v)}
                  min={10}
                  max={1000}
                  step={10}
                  disabled={!snapEnabled}
                />
                <span className="w-16 shrink-0 text-white/50">{snapIntervalMs}ms</span>
              </div>
            </div>

            <div>
              <p className="mb-1 font-medium">줌 레벨</p>
              <div className="flex items-center gap-2">
                <Slider value={[zoom]} onValueChange={([v]) => setZoom(v)} min={10} max={1000} step={10} />
                <span className="w-12 shrink-0 text-white/50">{zoom}%</span>
              </div>
              <div className="mt-1 flex gap-1">
                {[50, 100, 200, 400].map((preset) => (
                  <Button
                    key={preset}
                    size="sm"
                    variant="outline"
                    className="h-6 border-white/20 px-2 text-white"
                    onClick={() => setZoom(preset)}
                  >
                    {preset}%
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 font-medium">단축키</p>
              <div className="space-y-0.5 text-white/50">
                {SHORTCUTS.map((s) => (
                  <div key={s.key} className="flex justify-between">
                    <span className="rounded bg-white/10 px-1">{s.key}</span>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <TimelineTracks
        timeline={timeline}
        zoom={zoom}
        selectedClipId={selectedClipId}
        playheadMs={playheadMs}
        snapEnabled={snapEnabled}
        snapIntervalMs={snapIntervalMs}
        onSelectClip={setSelectedClipId}
        onSeek={setPlayheadMs}
        onCommitTiming={commitClipTiming}
      />
    </div>
  );
}
