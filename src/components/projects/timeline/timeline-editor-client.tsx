"use client";

import Link from "next/link";
import { ArrowLeft, Maximize2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { ScriptPanel } from "@/components/projects/detail/script-panel";
import { TimelineTracks } from "@/components/projects/timeline/timeline-tracks";
import { useJobProgress } from "@/hooks/use-job-progress";
import {
  analyzeSubtitleLineLength,
  buildTimelineTracks,
  computeTimelineStats,
  RECOMMENDED_SUBTITLE_CHARS_PER_LINE,
  validateTimeline,
  type TimelineValidationResult,
} from "@/lib/timeline";
import { cn } from "@/lib/utils";
import type {
  EffectiveBgmSettings,
  SerializedAudioSegment,
  SerializedBgmTrack,
  SerializedImageAsset,
  SerializedProject,
  SerializedVideoAsset,
} from "@/types/project";

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

export function TimelineEditorClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<SerializedProject | null>(null);
  const [images, setImages] = useState<SerializedImageAsset[]>([]);
  const [segments, setSegments] = useState<SerializedAudioSegment[]>([]);
  const [video, setVideo] = useState<SerializedVideoAsset | null>(null);
  const [bgmEffective, setBgmEffective] = useState<EffectiveBgmSettings | null>(null);
  const [bgmTrack, setBgmTrack] = useState<SerializedBgmTrack | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<LeftTab>("script");
  const [zoom, setZoom] = useState(100);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapIntervalMs, setSnapIntervalMs] = useState(100);
  const [dismissedLints, setDismissedLints] = useState<Set<string>>(new Set());
  const [validation, setValidation] = useState<TimelineValidationResult | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { job, start } = useJobProgress(projectId, "RENDER");

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
      const [projectRes, imagesRes, segmentsRes, videoRes, bgmRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/images`),
        fetch(`/api/projects/${projectId}/tts`),
        fetch(`/api/projects/${projectId}/render`),
        fetch(`/api/projects/${projectId}/bgm-settings/effective`),
      ]);

      setProject(projectRes.ok ? await projectRes.json() : null);
      setImages(imagesRes.ok ? await imagesRes.json() : []);
      setSegments(segmentsRes.ok ? await segmentsRes.json() : []);
      setVideo(videoRes.ok ? await videoRes.json() : null);

      const bgm: EffectiveBgmSettings = bgmRes.ok ? await bgmRes.json() : { settings: null, scope: null };
      setBgmEffective(bgm);
      if (bgm.settings) {
        const trackRes = await fetch(`/api/bgm/${bgm.settings.trackId}`);
        setBgmTrack(trackRes.ok ? await trackRes.json() : null);
      } else {
        setBgmTrack(null);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const timeline = useMemo(
    () =>
      buildTimelineTracks({
        audioSegments: segments,
        images,
        bgm:
          bgmEffective?.settings && bgmTrack
            ? { title: bgmTrack.title, durationSec: bgmTrack.durationSec, loop: bgmEffective.settings.loop }
            : null,
      }),
    [segments, images, bgmEffective, bgmTrack],
  );

  const stats = useMemo(() => computeTimelineStats(timeline), [timeline]);
  const lint = useMemo(() => analyzeSubtitleLineLength(segments), [segments]);
  const lintVisible = lint.exceedingIds.length > 0 && !dismissedLints.has("subtitle-line-length");

  function handleValidate() {
    setValidation(validateTimeline(timeline));
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

  if (loading) {
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
          <Button variant="outline" size="sm" className="border-white/20 text-white" onClick={handleValidate}>
            유효성 검사
          </Button>
          <Button variant="outline" size="sm" className="border-white/20 text-white">
            품질 분석 {lint.exceedingIds.length > 0 && `(${lint.exceedingIds.length})`}
          </Button>
          <Button variant="outline" size="sm" className="border-white/10 text-white/30" disabled>
            라이브러리
          </Button>
          <Button variant="outline" size="sm" className="border-white/20 text-white" onClick={fetchAll}>
            ⟳ 동기화
          </Button>
          <Button variant="outline" size="sm" className="border-white/10 text-white/30" disabled title="Phase B/C 예정">
            ✨ AI 자동 편집
          </Button>
          <Button variant="outline" size="sm" className="border-white/10 text-white/30" disabled title="Phase B/C 예정">
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
          00:00.00 / {(timeline.durationMs / 1000).toFixed(2)}s
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
              자막 탭은 다음 라운드(Phase B)에서 지원 예정입니다.
            </div>
          )}
          {activeTab === "preview" && (
            <div className="flex h-full items-center justify-center text-sm text-white/40">
              합성 미리보기는 다음 라운드(Phase B)에서 지원 예정입니다.
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
                권장: {RECOMMENDED_SUBTITLE_CHARS_PER_LINE}자/줄 | 현재 최대: {lint.maxLength}자 (클릭하여{" "}
                {lint.exceedingIds.length}개 클립 선택)
              </p>
              <p className="mt-1 text-white/50">
                롱폼 한국어 자막은 {RECOMMENDED_SUBTITLE_CHARS_PER_LINE}자/줄이 가장 읽기 좋습니다 (Netflix 기준
                16자, 롱폼 기준)
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/20 text-white"
                  onClick={() => setActiveTab("subtitle")}
                >
                  자막 선택 후 재구성
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
            <p className="text-white/40">클립을 선택하세요</p>
            <p className="rounded-md bg-white/5 p-2 text-white/60">
              클립을 클릭하여 선택하면 해당 클립의 속성을 편집할 수 있습니다. Ctrl+클릭으로 여러 클립을 선택할 수
              있습니다.
            </p>

            <div>
              <p className="mb-1 font-medium">타임라인 통계</p>
              <div className="grid grid-cols-2 gap-1 text-white/60">
                <span>트랙 {stats.trackCount}개</span>
                <span>총 클립 {stats.totalClips}개</span>
                <span>길이 {stats.durationSec.toFixed(1)}초</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {stats.clipCountsByTrack
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

      <TimelineTracks timeline={timeline} zoom={zoom} />
    </div>
  );
}
