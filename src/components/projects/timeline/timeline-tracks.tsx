"use client";

import { ChevronDown, ChevronUp, Eye, EyeOff, List, Lock, Unlock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  clampClipTiming,
  clampTrimEnd,
  clampTrimStart,
  computeCoveredClipIds,
  computeRulerStepSec,
  snapToGrid,
  type PersistedTimeline,
  type PersistedTimelineClip,
  type PersistedTimelineTrack,
  type TimelineTrackType,
} from "@/lib/timeline";

const TRACK_COLORS: Record<TimelineTrackType, string> = {
  SUBTITLE: "bg-amber-400",
  VIDEO: "bg-purple-500",
  IMAGE: "bg-sky-500",
  TTS: "bg-emerald-500",
  AUDIO: "bg-orange-500",
  BGM: "bg-orange-400",
  SFX: "bg-pink-400",
};

const BASE_PX_PER_SEC = 20;
const TRIM_HANDLE_PX = 6;
const RULER_MINOR_SUBDIVISIONS = 5;

function formatTimecode(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type InteractionMode = "move" | "trim-start" | "trim-end";

type Interaction = {
  clipId: string;
  mode: InteractionMode;
  startClientX: number;
  originStartMs: number;
  originEndMs: number;
  minMs: number;
  maxMs: number;
  pxPerSec: number;
  previewStartMs: number;
  previewEndMs: number;
};

const ADDABLE_TRACK_TYPES: { type: TimelineTrackType; label: string }[] = [
  { type: "VIDEO", label: "비디오" },
  { type: "IMAGE", label: "이미지" },
  { type: "TTS", label: "TTS(음성)" },
  { type: "BGM", label: "BGM" },
  { type: "SFX", label: "효과음" },
  { type: "SUBTITLE", label: "자막" },
];

// 트랙 헤더 아이콘 공용: 마우스오버 툴팁 + on 상태(잠금/숨김 등)일 때 색으로도 구분되도록 한다
// (아이콘 모양만으로는 잠금/해제가 잘 구별되지 않는다는 지적 반영). 비활성 버튼도 span으로 감싸
// hover 이벤트가 막히지 않게 한다(shadcn Button과 동일한 이유).
function TrackIconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  // true면 "켜짐" 상태(잠김/숨김)를 나타내는 강조색으로 표시한다.
  active?: boolean;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
              "rounded px-1 disabled:opacity-20 disabled:hover:bg-transparent",
              active
                ? "text-amber-400 hover:bg-amber-400/10 hover:text-amber-300"
                : "text-white/40 hover:bg-white/10 hover:text-white",
              destructive && "hover:bg-white/10 hover:text-red-400",
            )}
          >
            <Icon className="size-3" />
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function TimelineTracks({
  timeline,
  zoom,
  heightPx,
  selectedClipId,
  multiSelectedIds,
  playheadMs,
  snapEnabled,
  snapIntervalMs,
  onSelectClip,
  onSeek,
  onCommitTiming,
  onAddTrack,
  onRemoveTrack,
  onUploadToTrack,
  onUpdateTrackFlags,
  onReorderTrack,
  onRemoveTrackGaps,
}: {
  timeline: PersistedTimeline;
  zoom: number;
  heightPx?: number;
  selectedClipId: string | null;
  multiSelectedIds: Set<string>;
  playheadMs: number;
  snapEnabled: boolean;
  snapIntervalMs: number;
  // additive=true(Ctrl/Cmd+클릭)면 멀티 셀렉트에 토글, false면 단일 선택으로 교체. clipId=null이면 전체 해제.
  onSelectClip: (clipId: string | null, additive: boolean) => void;
  onSeek: (ms: number) => void;
  onCommitTiming: (clipId: string, startMs: number, endMs: number) => void;
  onAddTrack: (type: TimelineTrackType) => void;
  onRemoveTrack: (trackId: string) => void;
  onUploadToTrack: (trackId: string, file: File) => void;
  onUpdateTrackFlags: (trackId: string, patch: { visible?: boolean; locked?: boolean }) => void;
  onReorderTrack: (trackId: string, direction: "up" | "down") => void;
  onRemoveTrackGaps: (trackId: string) => void;
}) {
  const pxPerSec = (BASE_PX_PER_SEC * zoom) / 100;
  const durationSec = timeline.durationMs / 1000;
  const totalWidth = Math.max(durationSec * pxPerSec, 400);

  const scrollRef = useRef<HTMLDivElement>(null);
  const TRACK_LABEL_WIDTH = 160; // 좌측 트랙 라벨(sticky w-40) 폭 — 가로 가시영역 계산에 뺀다.

  // 재생헤드가 가로 가시영역을 벗어나면 자동으로 스크롤해 항상 보이게 한다(줌 100%↑에서 재생/탐색 시).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const playheadX = (playheadMs / 1000) * pxPerSec;
    const viewLeft = el.scrollLeft;
    const viewWidth = el.clientWidth - TRACK_LABEL_WIDTH;
    if (playheadX < viewLeft || playheadX > viewLeft + viewWidth) {
      el.scrollLeft = Math.max(0, playheadX - viewWidth / 2);
    }
  }, [playheadMs, pxPerSec]);

  // Ctrl+휠: 트랙 영역 상하 스크롤(Shift+휠 좌우 스크롤은 브라우저 기본 동작). 기본 리스너는 passive라
  // preventDefault가 안 먹어 브라우저 확대와 충돌하므로 non-passive 네이티브 리스너로 등록한다.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      const node = scrollRef.current;
      if (!e.ctrlKey || !node) return;
      e.preventDefault();
      node.scrollTop += e.deltaY;
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const rulerStepSec = computeRulerStepSec(pxPerSec);
  const rulerMinorStepSec = rulerStepSec / RULER_MINOR_SUBDIVISIONS;
  const rulerMarks: number[] = [];
  const rulerMinorMarks: number[] = [];
  for (let t = 0; t <= durationSec + rulerStepSec; t += rulerStepSec) {
    rulerMarks.push(t);
    for (let i = 1; i < RULER_MINOR_SUBDIVISIONS; i++) {
      rulerMinorMarks.push(t + i * rulerMinorStepSec);
    }
  }

  const interactionRef = useRef<Interaction | null>(null);
  const snapEnabledRef = useRef(snapEnabled);
  const snapIntervalMsRef = useRef(snapIntervalMs);
  const onCommitTimingRef = useRef(onCommitTiming);
  const [preview, setPreview] = useState<{ clipId: string; startMs: number; endMs: number } | null>(null);

  useEffect(() => {
    snapEnabledRef.current = snapEnabled;
    snapIntervalMsRef.current = snapIntervalMs;
    onCommitTimingRef.current = onCommitTiming;
  }, [snapEnabled, snapIntervalMs, onCommitTiming]);

  // 리사이즈 디바이더와 동일한 패턴: mousedown 시점에만 인터랙션을 시작하고,
  // 실제 드래그 추적은 컴포넌트 마운트 시 한 번 등록한 window 리스너가 담당한다.
  useEffect(() => {
    function handleMove(e: MouseEvent) {
      const cur = interactionRef.current;
      if (!cur) return;
      const deltaMs = ((e.clientX - cur.startClientX) / cur.pxPerSec) * 1000;
      const snap = snapEnabledRef.current;
      const interval = snapIntervalMsRef.current;

      let nextStart = cur.previewStartMs;
      let nextEnd = cur.previewEndMs;

      if (cur.mode === "move") {
        const duration = cur.originEndMs - cur.originStartMs;
        let startMs = cur.originStartMs + deltaMs;
        if (snap) startMs = snapToGrid(startMs, interval);
        const clamped = clampClipTiming({ startMs, endMs: startMs + duration, minMs: cur.minMs, maxMs: cur.maxMs });
        nextStart = clamped.startMs;
        nextEnd = clamped.endMs;
      } else if (cur.mode === "trim-start") {
        let startMs = cur.originStartMs + deltaMs;
        if (snap) startMs = snapToGrid(startMs, interval);
        nextStart = clampTrimStart({ startMs, endMs: cur.originEndMs, minMs: cur.minMs });
        nextEnd = cur.originEndMs;
      } else {
        let endMs = cur.originEndMs + deltaMs;
        if (snap) endMs = snapToGrid(endMs, interval);
        nextEnd = clampTrimEnd({ startMs: cur.originStartMs, endMs, maxMs: cur.maxMs });
        nextStart = cur.originStartMs;
      }

      interactionRef.current = { ...cur, previewStartMs: nextStart, previewEndMs: nextEnd };
      setPreview({ clipId: cur.clipId, startMs: nextStart, endMs: nextEnd });
    }

    function handleUp() {
      const cur = interactionRef.current;
      if (cur) {
        onCommitTimingRef.current(cur.clipId, cur.previewStartMs, cur.previewEndMs);
      }
      interactionRef.current = null;
      setPreview(null);
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  function handleClipMouseDown(
    mode: InteractionMode,
    track: PersistedTimelineTrack,
    clip: PersistedTimelineClip,
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    e.preventDefault();
    // Ctrl/Cmd+클릭은 멀티 셀렉트 토글만 하고 드래그는 시작하지 않는다.
    if (e.ctrlKey || e.metaKey) {
      onSelectClip(clip.id, true);
      return;
    }
    onSelectClip(clip.id, false);
    // 잠긴 트랙은 선택은 되지만 이동/트림은 시작하지 않는다("이동/편집 방지").
    if (track.locked) return;
    beginInteraction(mode, track, clip, e);
  }

  function beginInteraction(
    mode: InteractionMode,
    track: PersistedTimelineTrack,
    clip: PersistedTimelineClip,
    e: React.MouseEvent,
  ) {
    // "이동"은 같은 트랙의 다른 클립과 자유롭게 겹칠 수 있다(§1.3 "자유 드래그+오버랩") — 이웃 경계로
    // 클램프하지 않고 타임라인 전체 범위 안에서만 막는다. 트림(길이 조절)은 기존처럼 이웃 클립 경계로
    // 클램프해 겹치지 않게 유지한다.
    let minMs: number;
    let maxMs: number;
    if (mode === "move") {
      // clampClipTiming은 maxMs를 "끝 시각의 상한"으로 보고 내부에서 duration을 빼 시작 시각을 구하므로,
      // durationMs를 미리 빼지 않고 그대로 전달한다.
      minMs = 0;
      maxMs = timeline.durationMs;
    } else {
      const sorted = [...track.clips].sort((a, b) => a.startMs - b.startMs);
      const idx = sorted.findIndex((c) => c.id === clip.id);
      minMs = idx > 0 ? sorted[idx - 1].endMs : 0;
      maxMs = idx < sorted.length - 1 ? sorted[idx + 1].startMs : Number.MAX_SAFE_INTEGER;
    }

    interactionRef.current = {
      clipId: clip.id,
      mode,
      startClientX: e.clientX,
      originStartMs: clip.startMs,
      originEndMs: clip.endMs,
      minMs,
      maxMs,
      pxPerSec,
      previewStartMs: clip.startMs,
      previewEndMs: clip.endMs,
    };
    setPreview({ clipId: clip.id, startMs: clip.startMs, endMs: clip.endMs });
  }

  function handleTimelineMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ms = Math.max(0, Math.min((x / pxPerSec) * 1000, timeline.durationMs));
    onSelectClip(null, false);
    onSeek(ms);
  }

  return (
    <div
      className="flex flex-col border-t border-white/10 bg-[#0d1017] text-xs text-white/80"
      style={{ height: heightPx ?? 224 }}
    >
      <div className="flex items-center gap-3 border-b border-white/10 px-3 py-1.5 text-white/50">
        <span>
          {formatTimecode(playheadMs / 1000)} / {formatTimecode(durationSec)}
        </span>
        <span className="ml-auto">Zoom: {zoom}%</span>
      </div>

      <div ref={scrollRef} className="flex flex-1 overflow-auto">
        <div className="sticky left-0 z-10 flex w-40 shrink-0 flex-col bg-[#0d1017]">
          <div className="h-6 shrink-0 border-b border-white/10" />
          {timeline.tracks.map((track, idx) => (
            <div key={track.id} className="flex h-14 shrink-0 flex-col justify-center gap-0.5 border-b border-white/5 px-2 text-white/70">
              <div className="flex items-center gap-1">
                <span className={cn("size-2 shrink-0 rounded-full", TRACK_COLORS[track.type])} />
                <span className="truncate">{track.name}</span>
                <div className="ml-auto flex shrink-0 items-center">
                  <TrackIconButton
                    icon={ChevronUp}
                    label={
                      track.locked || timeline.tracks[idx - 1]?.locked
                        ? "잠긴 트랙은 순서를 바꿀 수 없음"
                        : "위로 — 같은 종류 소스 중 표출 우선순위를 높임"
                    }
                    onClick={() => onReorderTrack(track.id, "up")}
                    disabled={idx === 0 || track.locked || timeline.tracks[idx - 1]?.locked}
                  />
                  <TrackIconButton
                    icon={ChevronDown}
                    label={
                      track.locked || timeline.tracks[idx + 1]?.locked
                        ? "잠긴 트랙은 순서를 바꿀 수 없음"
                        : "아래로 — 같은 종류 소스 중 표출 우선순위를 낮춤"
                    }
                    onClick={() => onReorderTrack(track.id, "down")}
                    disabled={idx === timeline.tracks.length - 1 || track.locked || timeline.tracks[idx + 1]?.locked}
                  />
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <TrackIconButton
                  icon={track.visible === false ? EyeOff : Eye}
                  label={track.visible === false ? "숨김 — 클릭해서 미리보기에서 다시 보이기" : "보임 — 클릭해서 미리보기에서 숨기기"}
                  onClick={() => onUpdateTrackFlags(track.id, { visible: track.visible === false })}
                  active={track.visible === false}
                />
                <TrackIconButton
                  icon={track.locked ? Lock : Unlock}
                  label={track.locked ? "잠김 — 클릭해서 잠금 해제" : "잠금 안 됨 — 클릭해서 편집/이동 방지"}
                  onClick={() => onUpdateTrackFlags(track.id, { locked: !track.locked })}
                  active={track.locked}
                />
                <TrackIconButton icon={List} label="클립 사이 빈 공간 제거" onClick={() => onRemoveTrackGaps(track.id)} />
                <div className="ml-auto flex shrink-0 items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <label className="cursor-pointer rounded px-1 text-white/40 hover:bg-white/10 hover:text-white">
                        +
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) onUploadToTrack(track.id, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </TooltipTrigger>
                    <TooltipContent>클립 추가(직접 업로드)</TooltipContent>
                  </Tooltip>
                  {!track.autoSync && (
                    <TrackIconButton icon={X} label="트랙 삭제" onClick={() => onRemoveTrack(track.id)} destructive />
                  )}
                </div>
              </div>
            </div>
          ))}
          <div className="flex h-8 shrink-0 items-center border-b border-white/5 px-2">
            <select
              className="w-full rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[11px] text-white/70"
              value=""
              onChange={(e) => {
                if (e.target.value) onAddTrack(e.target.value as TimelineTrackType);
                e.target.value = "";
              }}
            >
              <option value="">+ 트랙 추가</option>
              {ADDABLE_TRACK_TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ width: totalWidth }} className="relative" onMouseDown={handleTimelineMouseDown}>
          <div className="relative h-6 shrink-0 border-b border-white/10">
            {rulerMinorMarks.map((t) => (
              <span
                key={t}
                className="absolute bottom-0 h-1.5 w-px bg-white/15"
                style={{ left: t * pxPerSec }}
              />
            ))}
            {rulerMarks.map((t) => (
              <span key={t} className="absolute bottom-0 h-2.5 w-px bg-white/30" style={{ left: t * pxPerSec }} />
            ))}
            {rulerMarks.map((t) => (
              <span
                key={t}
                className="absolute top-0.5 text-[10px] text-white/40"
                style={{ left: t * pxPerSec }}
              >
                {formatTimecode(t)}
              </span>
            ))}
          </div>

          {timeline.tracks.map((track) => {
            // 같은 트랙 안에서 자유 드래그로 겹친 클립들 중, zIndex가 더 높은 클립에 가려진 것들을
            // 주황색 외곽선으로 표시한다(§1.3 "자유 드래그+오버랩").
            const coveredIds = computeCoveredClipIds(track.clips);
            return (
            <div key={track.id} className="relative h-14 border-b border-white/5">
              {track.clips.map((clip) => {
                const isPreview = preview?.clipId === clip.id;
                const startMs = isPreview ? preview!.startMs : clip.startMs;
                const endMs = isPreview ? preview!.endMs : clip.endMs;
                const left = (startMs / 1000) * pxPerSec;
                const width = Math.max(((endMs - startMs) / 1000) * pxPerSec, 2);
                const selected = selectedClipId === clip.id;
                const multiSelected = multiSelectedIds.has(clip.id) && !selected;
                const covered = coveredIds.has(clip.id);
                return (
                  <div
                    key={clip.id}
                    title={clip.payload.label}
                    onMouseDown={(e) => handleClipMouseDown("move", track, clip, e)}
                    className={cn(
                      "absolute top-2 flex h-10 cursor-grab items-center overflow-hidden rounded-sm px-1 text-[10px] text-black/80 active:cursor-grabbing",
                      TRACK_COLORS[track.type],
                      covered && "ring-2 ring-orange-400",
                      selected && "ring-2 ring-white",
                      multiSelected && "ring-2 ring-sky-400",
                    )}
                    style={{ left, width, zIndex: clip.zIndex }}
                  >
                    {width > 24 ? clip.payload.label : ""}
                    <div
                      onMouseDown={(e) => handleClipMouseDown("trim-start", track, clip, e)}
                      className="absolute inset-y-0 left-0 cursor-ew-resize"
                      style={{ width: TRIM_HANDLE_PX }}
                    />
                    <div
                      onMouseDown={(e) => handleClipMouseDown("trim-end", track, clip, e)}
                      className="absolute inset-y-0 right-0 cursor-ew-resize"
                      style={{ width: TRIM_HANDLE_PX }}
                    />
                  </div>
                );
              })}
            </div>
            );
          })}

          {/* 재생헤드(적색 바) — 클립(zIndex 부여됨)보다 위에 그려 모든 트랙 위로 세로 전체를 덮게 한다. */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-red-500"
            style={{ left: (playheadMs / 1000) * pxPerSec, zIndex: 100000 }}
          />
        </div>
      </div>
    </div>
  );
}
