"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ClipboardPaste,
  Copy,
  CopyPlus,
  FoldHorizontal,
  List,
  Maximize2,
  Redo2,
  Scale,
  Scissors,
  SplitSquareHorizontal,
  Trash2,
  Undo2,
  Wind,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScriptPanel } from "@/components/projects/detail/script-panel";
import { ClipPropertiesPanel } from "@/components/projects/timeline/clip-properties-panel";
import { TimelineTracks } from "@/components/projects/timeline/timeline-tracks";
import { useJobProgress } from "@/hooks/use-job-progress";
import {
  analyzeSubtitleLineLength,
  computeTimelineStats,
  formatMmSsMs,
  parseMmSsMs,
  RECOMMENDED_SUBTITLE_CHARS_PER_LINE,
  resolveImageEffectsFilter,
  resolveImageKenBurnsTransform,
  resolveSubtitleStyle,
  validateTimeline,
  type PersistedClipPayload,
  type PersistedTimeline,
  type PersistedTimelineClip,
  type TimelineTrackType,
  type TimelineValidationResult,
  type VideoClipMask,
} from "@/lib/timeline";
import { cn } from "@/lib/utils";
import { resolveVideoResolution } from "@/lib/video";
import { MaskOverlay } from "@/components/projects/timeline/mask-overlay";
import type { BgmSettings, EffectiveBgmSettings, SerializedProject, SerializedVideoAsset } from "@/types/project";

type LeftTab = "script" | "subtitle" | "preview" | "final";

const LEFT_TABS: { key: LeftTab; label: string }[] = [
  { key: "script", label: "스크립트" },
  { key: "subtitle", label: "자막" },
  { key: "preview", label: "미리보기" },
  { key: "final", label: "완성본" },
];

const SHORTCUTS: { key: string; label: string }[] = [
  { key: "Space", label: "재생/일시정지" },
  { key: "Home / End", label: "처음/끝으로" },
  { key: "Ctrl+Z / Ctrl+Y", label: "실행 취소/다시 실행" },
  { key: "S", label: "선택 클립 분할(재생헤드 위치)" },
  { key: "Ctrl+C / Ctrl+X", label: "복사 / 잘라내기" },
  { key: "Ctrl+V / Ctrl+D", label: "붙여넣기 / 복제" },
  { key: "Delete", label: "선택 클립 삭제" },
  { key: "Ctrl+클릭", label: "멀티 셀렉트 토글" },
];

const RIGHT_PANEL_DEFAULT_WIDTH = 288;
const RIGHT_PANEL_MIN_WIDTH = 220;
const RIGHT_PANEL_MAX_WIDTH = 560;

// shadcn Button의 outline variant는 bg-background(라이트 테마 전역 변수)를 그대로 쓰기 때문에,
// 이 다크 테마 에디터에서 className으로 border/text만 덮어쓰면 배경이 밝은 회색으로 남아
// 흰 글자가 거의 안 보이는 대비 문제가 생긴다. bg까지 함께 덮어써서 고정한다.
const OUTLINE_BTN = "border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white";
const OUTLINE_BTN_DISABLED = "border-white/10 bg-white/5 text-white/30 hover:bg-white/5 hover:text-white/30";
// "목표 길이 맞추기" 최대값 — 유효성 검사 패널에 이미 안내된 최종 렌더링 길이 제한(1800초)과 동일하게 맞춘다.
const MAX_TARGET_LENGTH_MS = 1_800_000;
// 타임라인 줌(스케일) 범위 — 기본 100%, 최소 30%, 최대 500%.
const ZOOM_MIN = 30;
const ZOOM_MAX = 500;

// 실행취소/다시실행 스냅샷: 클립의 시간뿐 아니라 payload까지 통째로 담아, 삭제/생성 같은
// "클립 목록 자체가 바뀌는" 조작도 되돌릴 수 있게 한다(§1.3 disclosure — 되돌리기는 서버의
// restoreClipsSnapshot이 수행하고, 여기서는 히스토리 스택에 넣을 스냅샷만 만든다).
type ClipSnapshot = { id: string; trackId: string; startMs: number; endMs: number; payload: PersistedClipPayload }[];

function snapshotClips(timeline: PersistedTimeline): ClipSnapshot {
  return timeline.tracks.flatMap((t) =>
    t.clips.map((c) => ({ id: c.id, trackId: t.id, startMs: c.startMs, endMs: c.endMs, payload: c.payload })),
  );
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

function formatClipTimecode(ms: number): string {
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${s}`;
}

// 자막 스타일 탭의 배경색+투명도를 미리보기 탭의 CSS로 그대로 옮기기 위한 변환.
function hexToRgba(hex: string, opacity: number): string {
  const clean = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, opacity))})`;
}

// 자막 탭 세그먼트 카드: 재생 중 현재 위치의 카드로 자동 스크롤 + 하이라이트되며,
// 텍스트는 카드별 로컬 draft로 편집 후 저장(다른 카드 편집과 서로 간섭하지 않도록).
function SubtitleCard({
  index,
  clip,
  isSelected,
  isActive,
  onSelect,
  onSave,
}: {
  index: number;
  clip: PersistedTimelineClip;
  isSelected: boolean;
  isActive: boolean;
  onSelect: () => void;
  onSave: (text: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(clip.payload.text ?? "");
  const [saving, setSaving] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(clip.payload.text ?? "");
  }, [clip.id, clip.payload.text]);

  useEffect(() => {
    if (isActive) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isActive]);

  const dirty = draft !== (clip.payload.text ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={cardRef}
      onClick={onSelect}
      className={cn(
        "cursor-pointer rounded-md border p-3 text-sm",
        isActive ? "border-sky-400 bg-sky-400/10" : isSelected ? "border-primary/60 bg-white/5" : "border-white/10 bg-white/5",
      )}
    >
      <div className="mb-1 flex items-center gap-2 text-xs text-white/40">
        <span>#{index + 1}</span>
        <span>
          {formatClipTimecode(clip.startMs)} – {formatClipTimecode(clip.endMs)}
        </span>
        {isActive && <span className="font-medium text-sky-400">재생중</span>}
      </div>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        className="min-h-14 border-white/20 bg-white/5 text-white"
      />
      {dirty && (
        <Button
          size="sm"
          className="mt-1.5"
          onClick={(e) => {
            e.stopPropagation();
            handleSave();
          }}
          disabled={saving}
        >
          {saving ? "저장 중..." : "저장"}
        </Button>
      )}
    </div>
  );
}

// 참조 사이트처럼 편집 도구를 아이콘+마우스오버 툴팁으로 표시한다(§5.5 disclosure).
function IconToolbarButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      {/* 비활성(disabled) 상태의 Button은 shadcn 기본 스타일(disabled:pointer-events-none) 때문에
          마우스오버 이벤트 자체가 발생하지 않아 툴팁이 뜨지 않는다 — span으로 감싸 hover를 그쪽에서 받는다. */}
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            size="icon"
            variant={destructive ? "destructive" : "outline"}
            className={cn("size-7", !destructive && OUTLINE_BTN)}
            onClick={onClick}
            disabled={disabled}
          >
            <Icon className="size-4" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// 재생 관련 툴바: 좌측 콘텐츠 영역 위(전 탭 공통)와 하단 타임라인 바로 위, 두 곳에 동일하게 표시된다.
function PlaybackToolbar({
  isPlaying,
  onTogglePlay,
  onSeekStart,
  onSeekEnd,
  playheadMs,
  durationMs,
  playbackSpeed,
  onSpeedChange,
  zoom,
  onZoomChange,
  snapEnabled,
  onSnapChange,
  editTools,
  showSpeedAndZoom = true,
}: {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeekStart: () => void;
  onSeekEnd: () => void;
  playheadMs: number;
  durationMs: number;
  playbackSpeed: number;
  onSpeedChange: (v: number) => void;
  zoom: number;
  onZoomChange: (v: number) => void;
  snapEnabled: boolean;
  onSnapChange: (v: boolean) => void;
  // 참조 사이트처럼 재생 툴바(좌)와 편집 도구 아이콘(중앙)을 한 줄에 배치할 때만 전달한다.
  editTools?: React.ReactNode;
  // 속도/줌 슬라이더는 화면 맨 위 툴바에만 두고, 타임라인 트랙 바로 위 툴바(editTools와 함께 쓰는 쪽)에서는
  // 감춘다 — 아이콘까지 함께 있으면 좁은 화면에서 배치가 찌그러지기 때문(기본값 true).
  showSpeedAndZoom?: boolean;
}) {
  const playbackControls = (
    <div className="flex items-center gap-2 text-sm">
      <button onClick={onSeekStart} className="text-white/60 hover:text-white" title="처음으로 (Home)">
        |◀
      </button>
      <button onClick={onTogglePlay} className="text-white hover:text-white/80" title="재생/일시정지 (Space)">
        {isPlaying ? "⏸" : "▶"}
      </button>
      <button onClick={onSeekEnd} className="text-white/60 hover:text-white" title="끝으로 (End)">
        ▶|
      </button>
    </div>
  );

  const rightControls = (
    <>
      {showSpeedAndZoom && (
        <div className="flex items-center gap-1.5">
          <span>속도</span>
          <Slider
            className="w-20"
            value={[playbackSpeed]}
            onValueChange={([v]) => onSpeedChange(v)}
            min={0.1}
            max={4}
            step={0.1}
          />
          <span className="w-9 shrink-0">{playbackSpeed.toFixed(1)}x</span>
        </div>
      )}
      <span className="shrink-0">
        {(playheadMs / 1000).toFixed(2)}s / {(durationMs / 1000).toFixed(2)}s
      </span>
      {showSpeedAndZoom && (
        <div className="flex items-center gap-1.5">
          <ZoomOut className="size-3.5 text-white/40" />
          <Slider
            className="w-20"
            value={[zoom]}
            onValueChange={([v]) => onZoomChange(v)}
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={1}
          />
          <ZoomIn className="size-3.5 text-white/40" />
          <span className="w-9 shrink-0">{zoom}%</span>
        </div>
      )}
      <span className={cn("shrink-0 rounded-full bg-white/5 px-2 py-0.5", !editTools && "ml-auto")}>
        ⓘ Preview Mode — 애니메이션/전환효과는 렌더링 후 확인
      </span>
      <label className="flex shrink-0 items-center gap-1">
        <Checkbox checked={snapEnabled} onCheckedChange={(v) => onSnapChange(Boolean(v))} />
        스냅
      </label>
      <Maximize2 className="size-3.5 shrink-0" />
    </>
  );

  // 참조 사이트 배치(재생 툴바 좌측 / 편집 도구 중앙 / 나머지 우측)를 3열 그리드로 재현한다 —
  // 가운데 열이 남는 공간을 모두 차지해 좌우 콘텐츠 폭과 무관하게 항상 중앙에 오도록 한다.
  if (editTools) {
    return (
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-white/10 px-4 py-1.5 text-xs text-white/60">
        {playbackControls}
        <div className="flex flex-wrap items-center justify-center gap-1.5">{editTools}</div>
        <div className="flex items-center gap-3">{rightControls}</div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-b border-white/10 px-4 py-1.5 text-xs text-white/60">
      {playbackControls}
      {rightControls}
    </div>
  );
}

export function TimelineEditorClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<SerializedProject | null>(null);
  const [video, setVideo] = useState<SerializedVideoAsset | null>(null);
  const [timeline, setTimeline] = useState<PersistedTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [activeTab, setActiveTab] = useState<LeftTab>("script");
  const [zoom, setZoom] = useState(100);
  // 편집 프리뷰 전용 재생 속도(§5.5) — 합성 미리보기 재생 기능은 다음 라운드에서 이 값을 소비할 예정.
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapIntervalMs, setSnapIntervalMs] = useState(100);
  const [dismissedLints, setDismissedLints] = useState<Set<string>>(new Set());
  const [validation, setValidation] = useState<TimelineValidationResult | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { job, start } = useJobProgress(projectId, "RENDER");

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(new Set());
  // 이미지 속성 패널의 "마스크" 서브탭이 열려 있는 동안에만 미리보기 화면에 드래그 편집 오버레이를 그린다.
  const [maskTabActive, setMaskTabActive] = useState(false);
  const clipboardRef = useRef<{ trackId: string; payload: PersistedClipPayload; durationMs: number }[]>([]);
  const [breathingGapMs, setBreathingGapMs] = useState(300);
  const [targetLengthMs, setTargetLengthMs] = useState(60000);
  const [targetLengthDraft, setTargetLengthDraft] = useState(() => formatMmSsMs(60000));
  // 참조 사이트처럼 호흡구간/목표길이 아이콘을 클릭하면 툴바가 확장되어 인라인 입력+확인/취소가 나타난다.
  const [openInlineEditor, setOpenInlineEditor] = useState<"breathing" | "scale" | null>(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [history, setHistory] = useState<ClipSnapshot[]>([]);
  const [future, setFuture] = useState<ClipSnapshot[]>([]);

  // 실제 재생 엔진: TTS 클립을 순서대로 이어 재생하고 BGM을 동시에 재생한다.
  const [isPlaying, setIsPlaying] = useState(false);
  const [bgmSettings, setBgmSettings] = useState<BgmSettings | null>(null);
  const ttsAudioRef = useRef<HTMLAudioElement>(null);
  const bgmAudioRef = useRef<HTMLAudioElement>(null);
  const currentTtsClipIdRef = useRef<string | null>(null);

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
      const [projectRes, videoRes, timelineRes, bgmRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/render`),
        fetch(`/api/projects/${projectId}/timeline`),
        fetch(`/api/projects/${projectId}/bgm-settings/effective`),
      ]);

      setProject(projectRes.ok ? await projectRes.json() : null);
      setVideo(videoRes.ok ? await videoRes.json() : null);
      setTimeline(timelineRes.ok ? await timelineRes.json() : null);
      const bgmEffective: EffectiveBgmSettings = bgmRes.ok ? await bgmRes.json() : { settings: null, scope: null };
      setBgmSettings(bgmEffective.settings);
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

  const videoResolution = resolveVideoResolution(project?.videoFormat ?? "SHORT");
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
  const canSplit = selected != null && playheadMs > selected.clip.startMs && playheadMs < selected.clip.endMs;

  // 멀티 셀렉트된 클립 전체(자막 탭 일괄 편집 모드 등에서 사용) — 없으면 primary 선택 하나만 담는다.
  const selectedClips = useMemo(() => {
    if (!timeline) return [];
    const ids = multiSelectedIds.size > 0 ? multiSelectedIds : selectedClipId ? new Set([selectedClipId]) : new Set<string>();
    const result: PersistedTimelineClip[] = [];
    for (const track of timeline.tracks) {
      for (const c of track.clips) {
        if (ids.has(c.id)) result.push(c);
      }
    }
    return result;
  }, [timeline, multiSelectedIds, selectedClipId]);

  // multiSelectedIds는 "현재 작업 대상 전체"(복사/삭제/갭제거 등)를, selectedClipId는 "마지막으로 클릭한
  // 클립"(속성 패널 표시용)을 가리킨다. 일반 클릭은 둘 다 그 클립 하나로 맞추고, Ctrl/Cmd+클릭만 토글한다.
  function handleSelectClip(clipId: string | null, additive: boolean) {
    if (clipId === null) {
      setSelectedClipId(null);
      setMultiSelectedIds(new Set());
      return;
    }
    if (additive) {
      setMultiSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(clipId)) next.delete(clipId);
        else next.add(clipId);
        return next;
      });
      setSelectedClipId(clipId);
    } else {
      setSelectedClipId(clipId);
      setMultiSelectedIds(new Set([clipId]));
      // 선택한 클립이 미리보기 탭에 실제로 표시되도록 재생헤드를 클립 구간 안으로 이동한다.
      // (미리보기는 재생헤드 기준으로 그려지므로, 이 이동이 없으면 선택한 클립과 무관한 화면이 보일 수 있다.)
      // 정확히 시작 시각으로 옮기면 canSplit(재생헤드가 시작보다 "엄격히" 커야 함) 조건이 항상 거짓이 되어
      // 클립을 선택하자마자 분할 버튼이 비활성 상태로 보이는 버그가 있었다 — 중간 지점으로 옮겨 피한다.
      const found = findClip(timeline, clipId);
      if (found) seekTo(Math.floor((found.clip.startMs + found.clip.endMs) / 2));
    }
  }

  // BGM 오디오 엘리먼트는 설정이 바뀔 때만 src/재생 파라미터를 갱신하고, 재생 시작/탐색은
  // playBgmFrom에서 currentTime만 조정한다(재생 중 트랙 전환 때마다 다시 로드하지 않기 위함).
  useEffect(() => {
    const audio = bgmAudioRef.current;
    if (!audio || !bgmSettings) return;
    audio.src = `/api/bgm/${bgmSettings.trackId}/file`;
    audio.loop = bgmSettings.loop;
    audio.volume = Math.min(1, Math.max(0, 10 ** (bgmSettings.volumeDb / 20)));
    audio.playbackRate = bgmSettings.playbackSpeed;
  }, [bgmSettings]);

  // 같은 타입 트랙이 여러 개면(예: "+ 트랙 추가"로 만든 Image 2) visible한 트랙 중 order가 가장 작은
  // (우선순위가 가장 높은) 트랙 하나만 미리보기/재생에 쓴다. 시간대별로 트랙을 넘나드는 완전한 레이어
  // 합성(겹친 구간만 상위가 이김)은 후속 라운드 과제로 남겨둔다(§1.3 disclosure).
  function getTrackClips(type: PersistedTimeline["tracks"][number]["type"]) {
    const candidates = (timeline?.tracks ?? [])
      .filter((t) => t.type === type && t.visible !== false)
      .sort((a, b) => a.order - b.order);
    return candidates[0]?.clips ?? [];
  }

  function findClipAtMs(clips: PersistedTimelineClip[], ms: number) {
    return clips.find((c) => ms >= c.startMs && ms < c.endMs) ?? null;
  }

  const activeSubtitleClip = isPlaying ? findClipAtMs(getTrackClips("SUBTITLE"), playheadMs) : null;
  // 미리보기 탭 합성용: 재생 여부와 무관하게 항상 현재 재생헤드 위치의 이미지/자막을 보여준다.
  const previewImageClip = findClipAtMs(getTrackClips("IMAGE"), playheadMs);
  const previewSubtitleClip = findClipAtMs(getTrackClips("SUBTITLE"), playheadMs);
  // 스타일 탭에서 설정한 폰트/크기/색상/배경/위치/테두리가 실제 렌더링(ASS 번인)과 동일하게 반영되도록,
  // 하드코딩된 스타일 대신 resolveSubtitleStyle 결과를 그대로 쓴다.
  const previewSubtitleStyle = previewSubtitleClip
    ? resolveSubtitleStyle(previewSubtitleClip.payload.style, videoResolution.width, videoResolution.height)
    : null;
  // "이미지 효과" 탭의 색보정/패닝/줌 값도 마스크·자막 스타일과 같은 방식으로 미리보기에 근사 반영한다.
  const previewImageFilter = previewImageClip ? resolveImageEffectsFilter(previewImageClip.payload.effects) : "";
  const previewImageProgress = previewImageClip
    ? (playheadMs - previewImageClip.startMs) / Math.max(1, previewImageClip.endMs - previewImageClip.startMs)
    : 0;
  const previewImageTransform = previewImageClip
    ? resolveImageKenBurnsTransform(previewImageClip.payload.effects, previewImageClip.id, previewImageProgress)
    : "";

  // 미리보기는 브라우저에 실제 해상도(예: 1080x1920)보다 작게 그려지므로, 컨테이너의 실측 너비를 재서
  // 폰트 크기/위치/테두리 두께 같은 절대 px 값들을 그 비율만큼 축소해 실제 영상과 같은 비율로 보이게 한다.
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  useEffect(() => {
    if (activeTab !== "preview") return;
    const el = previewContainerRef.current;
    if (!el) return;
    const update = () => setPreviewScale(el.clientWidth / videoResolution.width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeTab, videoResolution.width]);

  function playTtsFrom(atMs: number) {
    const ttsClips = getTrackClips("TTS");
    const clip = findClipAtMs(ttsClips, atMs) ?? ttsClips.find((c) => c.startMs >= atMs) ?? null;
    const audio = ttsAudioRef.current;
    if (!clip || !audio || !clip.payload.sourceId) {
      stopPlayback();
      return;
    }
    if (currentTtsClipIdRef.current !== clip.id) {
      currentTtsClipIdRef.current = clip.id;
      audio.src = `/api/projects/${projectId}/tts/${clip.payload.sourceId}/audio`;
    }
    audio.currentTime = Math.max(0, (atMs - clip.startMs) / 1000);
    audio.play().catch(() => {});
  }

  function playBgmFrom(atMs: number) {
    const audio = bgmAudioRef.current;
    if (!audio || !bgmSettings) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = (atMs / 1000) % audio.duration;
    }
    audio.play().catch(() => {});
  }

  function stopPlayback() {
    ttsAudioRef.current?.pause();
    bgmAudioRef.current?.pause();
    setIsPlaying(false);
  }

  function togglePlay() {
    if (isPlaying) {
      stopPlayback();
      return;
    }
    setIsPlaying(true);
    playTtsFrom(playheadMs);
    playBgmFrom(playheadMs);
  }

  function seekTo(ms: number) {
    const clamped = Math.max(0, Math.min(ms, timeline?.durationMs ?? 0));
    setPlayheadMs(clamped);
    if (isPlaying) {
      playTtsFrom(clamped);
      playBgmFrom(clamped);
    }
  }

  function handleTtsTimeUpdate() {
    const audio = ttsAudioRef.current;
    const clipId = currentTtsClipIdRef.current;
    if (!audio || !clipId) return;
    const clip = getTrackClips("TTS").find((c) => c.id === clipId);
    if (!clip) return;
    setPlayheadMs(clip.startMs + audio.currentTime * 1000);
  }

  function handleTtsEnded() {
    const ttsClips = getTrackClips("TTS");
    const idx = ttsClips.findIndex((c) => c.id === currentTtsClipIdRef.current);
    const next = ttsClips[idx + 1];
    if (next) {
      playTtsFrom(next.startMs);
    } else {
      stopPlayback();
      setPlayheadMs(timeline?.durationMs ?? 0);
    }
  }

  // Space/Home/End 재생 단축키 — 텍스트 입력 중에는 무시하고, 아래 함수들은 매 렌더마다 새로 만들어지므로
  // ref에 최신 버전을 담아 마운트 시 한 번만 등록한 리스너에서 항상 최신 함수를 참조하게 한다.
  const playbackShortcutsRef = useRef({ togglePlay, seekTo, durationMs: timeline?.durationMs ?? 0 });
  playbackShortcutsRef.current = { togglePlay, seekTo, durationMs: timeline?.durationMs ?? 0 };

  useEffect(() => {
    function handlePlaybackKeys(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping = !!target && ["INPUT", "TEXTAREA"].includes(target.tagName);
      if (isTyping) return;
      const { togglePlay: play, seekTo: seek, durationMs } = playbackShortcutsRef.current;
      if (e.code === "Space") {
        e.preventDefault();
        play();
      } else if (e.code === "Home") {
        e.preventDefault();
        seek(0);
      } else if (e.code === "End") {
        e.preventDefault();
        seek(durationMs);
      }
    }
    window.addEventListener("keydown", handlePlaybackKeys);
    return () => window.removeEventListener("keydown", handlePlaybackKeys);
  }, []);

  function handleValidate() {
    if (timeline) setValidation(validateTimeline(timeline));
  }

  // 클립 목록 자체가 바뀌는 조작(삭제/붙여넣기/복제/분할/갭 제거 등) 앞에서 호출해 실행취소 스택에
  // "그 시점 전체 클립 목록"을 남긴다. 이 함수는 useCallback으로 감싸지 않은 일반 핸들러들에서만
  // 쓰므로, 매 렌더의 최신 timeline 클로저를 그대로 참조해도 안전하다.
  function pushHistory() {
    if (!timeline) return;
    setHistory((h) => [...h, snapshotClips(timeline)]);
    setFuture([]);
  }

  // 드래그/트림(타이밍 변경)은 실행취소 대상이므로 커밋 전에 현재 상태를 히스토리에 남긴다.
  const commitClipTiming = useCallback(
    async (clipId: string, startMs: number, endMs: number) => {
      setTimeline((prev) => {
        if (!prev) return prev;
        setHistory((h) => [...h, snapshotClips(prev)]);
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

  // 미리보기 화면의 마스크 드래그 편집(MaskOverlay)에서 오는 전체 마스크 객체를 저장한다.
  // (마스크 API는 부분 patch가 아닌 전체 객체 교체를 기대함 — MaskTab 슬라이더와 동일한 방식.)
  async function handleMaskPatch(clipId: string, mask: NonNullable<VideoClipMask>) {
    const res = await fetch(`/api/projects/${projectId}/timeline/clips/${clipId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mask }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTimeline((prev) => (prev ? patchClipInTimeline(prev, clipId, { payload: updated.payload }) : prev));
    }
  }

  const handleUndo = useCallback(async () => {
    if (history.length === 0 || !timeline) return;
    const prevSnapshot = history[history.length - 1];
    setFuture((f) => [...f, snapshotClips(timeline)]);
    setHistory((h) => h.slice(0, -1));
    await fetch(`/api/projects/${projectId}/timeline/clips/snapshot`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clips: prevSnapshot }),
    });
    await fetchAll();
  }, [history, timeline, projectId, fetchAll]);

  const handleRedo = useCallback(async () => {
    if (future.length === 0 || !timeline) return;
    const nextSnapshot = future[future.length - 1];
    setHistory((h) => [...h, snapshotClips(timeline)]);
    setFuture((f) => f.slice(0, -1));
    await fetch(`/api/projects/${projectId}/timeline/clips/snapshot`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clips: nextSnapshot }),
    });
    await fetchAll();
  }, [future, timeline, projectId, fetchAll]);

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

  // 복사/잘라내기/붙여넣기/복제/삭제/분할(S) 단축키 — 이 핸들러들은 selectedClipId 등에 의존해 매 렌더마다
  // 새로 만들어지므로, ref에 최신 버전을 담아 마운트 시 한 번만 등록한 리스너에서 항상 최신 함수를 참조한다.
  const editShortcutsRef = useRef({ handleCopy, handleCut, handlePaste, handleDuplicateSelected, handleDeleteClip, handleSplit, canSplit });
  editShortcutsRef.current = { handleCopy, handleCut, handlePaste, handleDuplicateSelected, handleDeleteClip, handleSplit, canSplit };

  useEffect(() => {
    function handleEditKeys(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping = !!target && ["INPUT", "TEXTAREA"].includes(target.tagName);
      if (isTyping) return;
      const h = editShortcutsRef.current;
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key === "c") {
        e.preventDefault();
        h.handleCopy();
      } else if (meta && e.key === "x") {
        e.preventDefault();
        h.handleCut();
      } else if (meta && e.key === "v") {
        e.preventDefault();
        h.handlePaste();
      } else if (meta && e.key === "d") {
        e.preventDefault();
        h.handleDuplicateSelected();
      } else if (e.key === "Delete") {
        e.preventDefault();
        h.handleDeleteClip();
      } else if ((e.key === "s" || e.key === "S") && !meta) {
        if (h.canSplit) h.handleSplit();
      }
    }
    window.addEventListener("keydown", handleEditKeys);
    return () => window.removeEventListener("keydown", handleEditKeys);
  }, []);

  async function handleSplit() {
    if (!selected || !canSplit) return;
    pushHistory();
    const res = await fetch(`/api/projects/${projectId}/timeline/clips/${selected.clip.id}/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ atMs: playheadMs }),
    });
    if (res.ok) {
      setSelectedClipId(null);
      setMultiSelectedIds(new Set());
      await fetchAll();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "분할에 실패했습니다.");
    }
  }

  function currentSelectionIds(): string[] {
    if (multiSelectedIds.size > 0) return Array.from(multiSelectedIds);
    return selectedClipId ? [selectedClipId] : [];
  }

  // 멀티 셀렉트를 지원하는 삭제 — 속성 패널의 "삭제" 버튼, Delete 단축키에서 공용으로 쓴다.
  async function handleDeleteClip() {
    const ids = currentSelectionIds();
    if (ids.length === 0) return;
    pushHistory();
    const res = await fetch(`/api/projects/${projectId}/timeline/clips/bulk`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (res.ok) {
      setSelectedClipId(null);
      setMultiSelectedIds(new Set());
      await fetchAll();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "삭제에 실패했습니다.");
    }
  }

  function handleCopy() {
    const ids = new Set(currentSelectionIds());
    if (ids.size === 0 || !timeline) return;
    const items: { trackId: string; payload: PersistedClipPayload; durationMs: number }[] = [];
    for (const track of timeline.tracks) {
      for (const clip of track.clips) {
        if (ids.has(clip.id)) {
          items.push({ trackId: track.id, payload: clip.payload, durationMs: clip.endMs - clip.startMs });
        }
      }
    }
    clipboardRef.current = items;
  }

  async function handleCut() {
    if (currentSelectionIds().length === 0) return;
    handleCopy();
    await handleDeleteClip();
  }

  // 붙여넣기(Ctrl+V)/복사(Ctrl+C): 리플 삽입은 하지 않고 재생헤드부터 이웃 경계 안으로 클램프해 배치한다.
  async function handlePaste() {
    const items = clipboardRef.current;
    if (items.length === 0) return;
    pushHistory();
    const byTrack = new Map<string, { payload: PersistedClipPayload; durationMs: number }[]>();
    for (const item of items) {
      const arr = byTrack.get(item.trackId) ?? [];
      arr.push({ payload: item.payload, durationMs: item.durationMs });
      byTrack.set(item.trackId, arr);
    }
    for (const [trackId, group] of Array.from(byTrack)) {
      await fetch(`/api/projects/${projectId}/timeline/tracks/${trackId}/paste`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atMs: playheadMs, items: group }),
      });
    }
    await fetchAll();
  }

  async function handleDuplicateSelected() {
    const ids = currentSelectionIds();
    if (ids.length === 0) return;
    pushHistory();
    let lastError: string | null = null;
    for (const id of ids) {
      const res = await fetch(`/api/projects/${projectId}/timeline/clips/${id}/duplicate`, { method: "POST" });
      if (!res.ok) lastError = (await res.json().catch(() => null))?.error ?? "복제에 실패했습니다.";
    }
    await fetchAll();
    if (lastError) setError(lastError);
  }

  // trackId를 명시하면 그 트랙을(트랙 헤더의 "빈 공간 제거" 아이콘), 생략하면 현재 선택된 클립이
  // 속한 트랙을(편집 도구 툴바의 아이콘) 대상으로 한다.
  async function handleRemoveTrackGaps(trackId?: string) {
    const targetId = trackId ?? selected?.track.id;
    if (!targetId) return;
    pushHistory();
    const res = await fetch(`/api/projects/${projectId}/timeline/tracks/${targetId}/remove-gaps`, { method: "POST" });
    if (res.ok) {
      await fetchAll();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "갭 제거에 실패했습니다.");
    }
  }

  async function handleRemoveGapsBetweenSelected() {
    if (multiSelectedIds.size < 2) return;
    pushHistory();
    const res = await fetch(`/api/projects/${projectId}/timeline/clips/remove-gaps-between`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(multiSelectedIds) }),
    });
    if (res.ok) {
      await fetchAll();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "갭 제거에 실패했습니다.");
    }
  }

  async function handleAddBreathingGaps() {
    pushHistory();
    const res = await fetch(`/api/projects/${projectId}/timeline/tts-breathing-gaps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gapMs: breathingGapMs }),
    });
    if (res.ok) {
      setTimeline(await res.json());
    } else {
      setError((await res.json().catch(() => null))?.error ?? "호흡구간 추가에 실패했습니다.");
    }
    setOpenInlineEditor(null);
  }

  async function handleScaleTrack(overrideTargetMs?: number) {
    if (!selected) return;
    const targetMs = overrideTargetMs ?? targetLengthMs;
    pushHistory();
    const res = await fetch(`/api/projects/${projectId}/timeline/tracks/${selected.track.id}/scale-to-duration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetDurationMs: targetMs }),
    });
    if (res.ok) {
      await fetchAll();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "길이 조정에 실패했습니다.");
    }
    setOpenInlineEditor(null);
  }

  // "+ 트랙 추가": 자동 동기화되지 않는(autoSync=false) 새 트랙을 만든다. 아직 렌더링에는 연결되지 않는다.
  async function handleAddTrack(type: TimelineTrackType) {
    const res = await fetch(`/api/projects/${projectId}/timeline/tracks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    if (res.ok) {
      await fetchAll();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "트랙 추가에 실패했습니다.");
    }
  }

  async function handleRemoveTrack(trackId: string) {
    const res = await fetch(`/api/projects/${projectId}/timeline/tracks/${trackId}`, { method: "DELETE" });
    if (res.ok) {
      if (selected?.track.id === trackId) {
        setSelectedClipId(null);
        setMultiSelectedIds(new Set());
      }
      await fetchAll();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "트랙 삭제에 실패했습니다.");
    }
  }

  // 트랙 헤더의 보이기/숨기기·잠금 토글 — 낙관적으로 먼저 반영한 뒤 서버에 반영한다.
  async function handleUpdateTrackFlags(trackId: string, patch: { visible?: boolean; locked?: boolean }) {
    setTimeline((prev) =>
      prev ? { ...prev, tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)) } : prev,
    );
    const res = await fetch(`/api/projects/${projectId}/timeline/tracks/${trackId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) await fetchAll();
  }

  // 트랙 상하 이동(같은 타입 소스 간 표출 우선순위).
  async function handleReorderTrack(trackId: string, direction: "up" | "down") {
    const res = await fetch(`/api/projects/${projectId}/timeline/tracks/${trackId}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    });
    if (res.ok) {
      await fetchAll();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "순서 변경에 실패했습니다.");
    }
  }

  // "클립 추가 > 직접 업로드": 현재 재생헤드 위치에 파일을 업로드해 클립을 만든다.
  async function handleUploadToTrack(trackId: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("atMs", String(playheadMs));
    const res = await fetch(`/api/projects/${projectId}/timeline/tracks/${trackId}/upload`, {
      method: "POST",
      body: form,
    });
    if (res.ok) {
      await fetchAll();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "업로드에 실패했습니다.");
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
          <Button variant="outline" size="sm" className={OUTLINE_BTN} onClick={handleValidate}>
            유효성 검사
          </Button>
          <Button variant="outline" size="sm" className={OUTLINE_BTN}>
            품질 분석 {lint.exceedingIds.length > 0 && `(${lint.exceedingIds.length})`}
          </Button>
          <Button variant="outline" size="sm" className={OUTLINE_BTN_DISABLED} disabled>
            라이브러리
          </Button>
          <Button variant="outline" size="sm" className={OUTLINE_BTN} onClick={handleSync} disabled={syncing}>
            {syncing ? "동기화 중..." : "⟳ 동기화"}
          </Button>
          <Button variant="outline" size="sm" className={OUTLINE_BTN_DISABLED} disabled title="Phase C 예정">
            ✨ AI 자동 편집
          </Button>
          <Button variant="outline" size="sm" className={OUTLINE_BTN_DISABLED} disabled title="Phase C 예정">
            🔊 자동 효과음
          </Button>
          <Button size="sm" onClick={handleRender} disabled={rendering}>
            {rendering ? "렌더링 중..." : "⦿ 렌더링"}
          </Button>
        </div>
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
        <div className="flex min-w-0 flex-1 flex-col">
          {activeTab !== "final" && (
            <PlaybackToolbar
              isPlaying={isPlaying}
              onTogglePlay={togglePlay}
              onSeekStart={() => seekTo(0)}
              onSeekEnd={() => seekTo(timeline.durationMs)}
              playheadMs={playheadMs}
              durationMs={timeline.durationMs}
              playbackSpeed={playbackSpeed}
              onSpeedChange={setPlaybackSpeed}
              zoom={zoom}
              onZoomChange={setZoom}
              snapEnabled={snapEnabled}
              onSnapChange={setSnapEnabled}
            />
          )}
          <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "script" && (
            <div className="rounded-lg bg-background p-4 text-foreground">
              <ScriptPanel projectId={projectId} />
            </div>
          )}
          {activeTab === "subtitle" && (
            <div className="space-y-2">
              {subtitleClips.length === 0 ? (
                <p className="py-8 text-center text-sm text-white/40">자막이 없습니다.</p>
              ) : (
                subtitleClips.map((clip, i) => (
                  <SubtitleCard
                    key={clip.id}
                    index={i}
                    clip={clip}
                    isSelected={selectedClipId === clip.id}
                    isActive={activeSubtitleClip?.id === clip.id}
                    onSelect={() => {
                      handleSelectClip(clip.id, false);
                      seekTo(clip.startMs);
                    }}
                    onSave={async (text) => {
                      const res = await fetch(`/api/projects/${projectId}/timeline/clips/${clip.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text }),
                      });
                      if (res.ok) {
                        const updated = await res.json();
                        setTimeline((prev) =>
                          prev ? patchClipInTimeline(prev, clip.id, { payload: updated.payload }) : prev,
                        );
                      }
                    }}
                  />
                ))
              )}
              <p className="pt-2 text-center text-xs text-white/30">총 {subtitleClips.length}개 자막</p>
            </div>
          )}
          {activeTab === "preview" && (
            <div className="flex h-full items-center justify-center">
              <div
                ref={previewContainerRef}
                className={cn(
                  "relative overflow-hidden rounded-lg bg-black",
                  project?.videoFormat === "SHORT" ? "aspect-[9/16] h-full max-h-[70vh]" : "aspect-video w-full max-w-2xl",
                )}
              >
                {previewImageClip?.payload.sourceId ? (
                  <>
                    {previewImageClip.payload.mask && (
                      <svg width="0" height="0" className="absolute">
                        <defs>
                          <mask
                            id={`preview-mask-${previewImageClip.id}`}
                            maskUnits="objectBoundingBox"
                            maskContentUnits="objectBoundingBox"
                          >
                            <rect x={0} y={0} width={1} height={1} fill={previewImageClip.payload.mask.inverted ? "white" : "black"} />
                            {previewImageClip.payload.mask.shape === "rect" ? (
                              <rect
                                x={previewImageClip.payload.mask.x - previewImageClip.payload.mask.width / 2}
                                y={previewImageClip.payload.mask.y - previewImageClip.payload.mask.height / 2}
                                width={previewImageClip.payload.mask.width}
                                height={previewImageClip.payload.mask.height}
                                rx={
                                  (previewImageClip.payload.mask.roundnessPct / 100) *
                                  (Math.min(previewImageClip.payload.mask.width, previewImageClip.payload.mask.height) / 2)
                                }
                                fill={previewImageClip.payload.mask.inverted ? "black" : "white"}
                                transform={`rotate(${previewImageClip.payload.mask.rotationDeg} ${previewImageClip.payload.mask.x} ${previewImageClip.payload.mask.y})`}
                              />
                            ) : (
                              <ellipse
                                cx={previewImageClip.payload.mask.x}
                                cy={previewImageClip.payload.mask.y}
                                rx={previewImageClip.payload.mask.width / 2}
                                ry={previewImageClip.payload.mask.height / 2}
                                fill={previewImageClip.payload.mask.inverted ? "black" : "white"}
                                transform={`rotate(${previewImageClip.payload.mask.rotationDeg} ${previewImageClip.payload.mask.x} ${previewImageClip.payload.mask.y})`}
                              />
                            )}
                          </mask>
                        </defs>
                      </svg>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      key={previewImageClip.id}
                      src={`/api/projects/${projectId}/images/${previewImageClip.payload.sourceId}/file`}
                      alt=""
                      className="size-full object-cover"
                      style={{
                        ...(previewImageClip.payload.mask
                          ? {
                              maskImage: `url(#preview-mask-${previewImageClip.id})`,
                              WebkitMaskImage: `url(#preview-mask-${previewImageClip.id})`,
                            }
                          : undefined),
                        filter: previewImageFilter || undefined,
                        transform: previewImageTransform || undefined,
                      }}
                    />
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-white/30">이미지 없음</div>
                )}
                {previewSubtitleClip?.payload.text && previewSubtitleStyle && (
                  <p
                    className="absolute max-w-[90%] whitespace-pre-line text-center"
                    style={{
                      left: previewSubtitleStyle.positionXPx * previewScale,
                      top: previewSubtitleStyle.positionYPx * previewScale,
                      transform: "translate(-50%, -50%)",
                      fontFamily: previewSubtitleStyle.fontFamily,
                      fontSize: previewSubtitleStyle.fontSizePx * previewScale,
                      fontWeight: previewSubtitleStyle.bold ? 700 : 400,
                      color: previewSubtitleStyle.fontColor,
                      backgroundColor: hexToRgba(previewSubtitleStyle.backgroundColor, previewSubtitleStyle.backgroundOpacity),
                      border: `${Math.max(previewSubtitleStyle.borderWidthPx * previewScale, 0)}px solid ${previewSubtitleStyle.borderColor}`,
                      padding: `${4 * previewScale}px ${10 * previewScale}px`,
                      borderRadius: 4 * previewScale,
                      lineHeight: 1.3,
                    }}
                  >
                    {previewSubtitleClip.payload.text}
                  </p>
                )}
                {maskTabActive &&
                  selected?.track.type === "IMAGE" &&
                  previewImageClip?.id === selected.clip.id &&
                  previewImageClip.payload.mask && (
                    <MaskOverlay
                      clipId={previewImageClip.id}
                      mask={previewImageClip.payload.mask}
                      containerWidthPx={videoResolution.width * previewScale}
                      containerHeightPx={videoResolution.height * previewScale}
                      onPatch={(mask) => handleMaskPatch(previewImageClip.id, mask)}
                    />
                  )}
              </div>
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
                    <Button variant="outline" className={OUTLINE_BTN}>
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
                <Button size="sm" variant="outline" className={OUTLINE_BTN} onClick={handleFixSubtitleLineLength}>
                  자동 줄바꿈으로 수정
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white/50 hover:bg-white/10 hover:text-white/80"
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
            <p className="flex items-center justify-between font-medium">
              속성
              {multiSelectedIds.size > 1 && (
                <span className="rounded-full bg-sky-400/20 px-2 py-0.5 text-[11px] font-normal text-sky-300">
                  {multiSelectedIds.size}개 선택됨
                </span>
              )}
            </p>
            {selected &&
            (selected.track.type === "SUBTITLE" ||
              selected.track.type === "VIDEO" ||
              selected.track.type === "IMAGE" ||
              selected.track.type === "TTS" ||
              selected.track.type === "BGM") ? (
              <ClipPropertiesPanel
                projectId={projectId}
                clip={selected.clip}
                track={selected.track}
                selectedClips={selectedClips}
                videoWidth={videoResolution.width}
                videoHeight={videoResolution.height}
                onCommitTiming={commitClipTiming}
                onPatched={(payload) => setTimeline((prev) => (prev ? patchClipInTimeline(prev, selected.clip.id, { payload }) : prev))}
                onRefetchAll={fetchAll}
                onMaskTabActiveChange={setMaskTabActive}
              />
            ) : selected ? (
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

            {/* 클립 미선택 상태에서만 보이는 전역 정보 — 클립을 선택하면(자막/비디오 서브탭이든 일반 패널이든)
                아래 통계/스냅/줌/단축키가 속성 탭 밑에 계속 깔려 보이던 문제를 막기 위해 !selected로 감쌌다. */}
            {!selected && (
              <>
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
                    <Slider value={[zoom]} onValueChange={([v]) => setZoom(v)} min={ZOOM_MIN} max={ZOOM_MAX} step={1} />
                    <span className="w-12 shrink-0 text-white/50">{zoom}%</span>
                  </div>
                  <div className="mt-1 flex gap-1">
                    {[30, 100, 250, 500].map((preset) => (
                      <Button
                        key={preset}
                        size="sm"
                        variant="outline"
                        className={cn("h-6 px-2", OUTLINE_BTN)}
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
              </>
            )}
          </div>
        </div>
      </div>

      {/* 재생 툴바(좌)와 편집 도구 아이콘(중앙)을 한 줄에 배치(참조 사이트 레이아웃). 호흡구간(ms)/목표
          길이처럼 수치 입력이 필요한 두 기능은 아이콘 클릭 시 인라인으로 확장되어 나타난다. */}
      <TooltipProvider delayDuration={200}>
        <PlaybackToolbar
          isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          onSeekStart={() => seekTo(0)}
          onSeekEnd={() => seekTo(timeline.durationMs)}
          playheadMs={playheadMs}
          durationMs={timeline.durationMs}
          playbackSpeed={playbackSpeed}
          onSpeedChange={setPlaybackSpeed}
          zoom={zoom}
          onZoomChange={setZoom}
          snapEnabled={snapEnabled}
          onSnapChange={setSnapEnabled}
          showSpeedAndZoom={false}
          editTools={
            <>
              <IconToolbarButton icon={Undo2} label="실행 취소 (Ctrl+Z)" onClick={handleUndo} disabled={history.length === 0} />
              <IconToolbarButton icon={Redo2} label="다시 실행 (Ctrl+Y)" onClick={handleRedo} disabled={future.length === 0} />

              <span className="mx-1 text-white/20">|</span>

              <IconToolbarButton icon={SplitSquareHorizontal} label="분할 (S, 재생헤드 위치)" onClick={handleSplit} disabled={!canSplit} />
              <IconToolbarButton icon={Scissors} label="잘라내기 (Ctrl+X)" onClick={handleCut} />
              <IconToolbarButton icon={Copy} label="복사 (Ctrl+C)" onClick={handleCopy} />
              <IconToolbarButton icon={ClipboardPaste} label="붙여넣기 (Ctrl+V)" onClick={handlePaste} />
              <IconToolbarButton icon={CopyPlus} label="복제 (Ctrl+D)" onClick={handleDuplicateSelected} />
              <IconToolbarButton icon={Trash2} label="삭제 (Delete)" onClick={handleDeleteClip} destructive />

              <span className="mx-1 text-white/20">|</span>

              <IconToolbarButton
                icon={List}
                label="트랙 갭 제거 — 선택한 클립이 속한 트랙의 모든 갭을 제거"
                onClick={handleRemoveTrackGaps}
                disabled={!selected}
              />
              <IconToolbarButton
                icon={FoldHorizontal}
                label="선택 사이 갭 제거 — Ctrl+클릭으로 2개 이상 선택 후 사용"
                onClick={handleRemoveGapsBetweenSelected}
                disabled={multiSelectedIds.size < 2}
              />

              <span className="mx-1 text-white/20">|</span>

              <div className="flex items-center gap-1">
                <IconToolbarButton
                  icon={Wind}
                  label="TTS 전체에 호흡구간 추가"
                  onClick={() => setOpenInlineEditor(openInlineEditor === "breathing" ? null : "breathing")}
                />
                {openInlineEditor === "breathing" && (
                  <>
                    <span>호흡:</span>
                    <select
                      className="rounded border border-white/20 bg-white/5 px-1 py-1 text-white"
                      value={breathingGapMs}
                      onChange={(e) => setBreathingGapMs(Number(e.target.value))}
                    >
                      {[100, 150, 200, 250, 300, 350, 400, 450, 500].map((ms) => (
                        <option key={ms} value={ms}>
                          {(ms / 1000).toFixed(2)}초
                        </option>
                      ))}
                    </select>
                    <IconToolbarButton icon={Check} label="적용" onClick={handleAddBreathingGaps} />
                    <IconToolbarButton icon={X} label="취소" onClick={() => setOpenInlineEditor(null)} />
                  </>
                )}
              </div>

              <span className="mx-1 text-white/20">|</span>

              <div className="flex items-center gap-1">
                <IconToolbarButton
                  icon={Scale}
                  label="선택한 클립이 속한 트랙 전체를 목표 길이에 맞춰 비례 조정"
                  onClick={() => {
                    setTargetLengthDraft(formatMmSsMs(targetLengthMs));
                    setOpenInlineEditor(openInlineEditor === "scale" ? null : "scale");
                  }}
                  disabled={!selected}
                />
                {openInlineEditor === "scale" && (
                  <>
                    <span>목표:</span>
                    <input
                      type="text"
                      className="w-24 rounded border border-white/20 bg-white/5 px-1.5 py-1 font-mono text-white"
                      value={targetLengthDraft}
                      onChange={(e) => setTargetLengthDraft(e.target.value)}
                    />
                    <span className="text-white/40">mm:ss.ms (최대 {formatMmSsMs(MAX_TARGET_LENGTH_MS)})</span>
                    <IconToolbarButton
                      icon={Check}
                      label="적용"
                      onClick={() => {
                        const parsed = parseMmSsMs(targetLengthDraft);
                        if (parsed === null) return;
                        const clamped = Math.min(Math.max(parsed, 100), MAX_TARGET_LENGTH_MS);
                        setTargetLengthMs(clamped);
                        handleScaleTrack(clamped);
                      }}
                    />
                    <IconToolbarButton icon={X} label="취소" onClick={() => setOpenInlineEditor(null)} />
                  </>
                )}
              </div>
            </>
          }
        />
      </TooltipProvider>

      <TimelineTracks
        timeline={timeline}
        zoom={zoom}
        selectedClipId={selectedClipId}
        multiSelectedIds={multiSelectedIds}
        playheadMs={playheadMs}
        snapEnabled={snapEnabled}
        snapIntervalMs={snapIntervalMs}
        onSelectClip={handleSelectClip}
        onSeek={seekTo}
        onCommitTiming={commitClipTiming}
        onAddTrack={handleAddTrack}
        onRemoveTrack={handleRemoveTrack}
        onUploadToTrack={handleUploadToTrack}
        onUpdateTrackFlags={handleUpdateTrackFlags}
        onReorderTrack={handleReorderTrack}
        onRemoveTrackGaps={handleRemoveTrackGaps}
      />

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={ttsAudioRef} onTimeUpdate={handleTtsTimeUpdate} onEnded={handleTtsEnded} className="hidden" />
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={bgmAudioRef} className="hidden" />
    </div>
  );
}
