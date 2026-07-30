"use client";

import { ChevronDown, ChevronUp, Eye, EyeOff, List, Lock, Unlock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  clampClipTiming,
  clampTrimEnd,
  clampTrimStart,
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

export function TimelineTracks({
  timeline,
  zoom,
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

  const rulerMarks: number[] = [];
  const rulerStepSec = 30;
  for (let t = 0; t <= durationSec + rulerStepSec; t += rulerStepSec) {
    rulerMarks.push(t);
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
    const sorted = [...track.clips].sort((a, b) => a.startMs - b.startMs);
    const idx = sorted.findIndex((c) => c.id === clip.id);
    const minMs = idx > 0 ? sorted[idx - 1].endMs : 0;
    const maxMs = idx < sorted.length - 1 ? sorted[idx + 1].startMs : Number.MAX_SAFE_INTEGER;

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
    <div className="flex h-56 flex-col border-t border-white/10 bg-[#0d1017] text-xs text-white/80">
      <div className="flex items-center gap-3 border-b border-white/10 px-3 py-1.5 text-white/50">
        <span>
          {formatTimecode(playheadMs / 1000)} / {formatTimecode(durationSec)}
        </span>
        <span className="ml-auto">Zoom: {zoom}%</span>
      </div>

      <div className="flex flex-1 overflow-auto">
        <div className="sticky left-0 z-10 flex w-40 shrink-0 flex-col bg-[#0d1017]">
          <div className="h-6 shrink-0 border-b border-white/10" />
          {timeline.tracks.map((track, idx) => (
            <div key={track.id} className="flex h-14 shrink-0 flex-col justify-center gap-0.5 border-b border-white/5 px-2 text-white/70">
              <div className="flex items-center gap-1">
                <span className={cn("size-2 shrink-0 rounded-full", TRACK_COLORS[track.type])} />
                <span className="truncate">{track.name}</span>
                <div className="ml-auto flex shrink-0 items-center">
                  <button
                    onClick={() => onReorderTrack(track.id, "up")}
                    disabled={idx === 0}
                    className="rounded text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
                    title="위로 — 같은 종류 소스 중 표출 우선순위를 높임"
                  >
                    <ChevronUp className="size-3" />
                  </button>
                  <button
                    onClick={() => onReorderTrack(track.id, "down")}
                    disabled={idx === timeline.tracks.length - 1}
                    className="rounded text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
                    title="아래로 — 같은 종류 소스 중 표출 우선순위를 낮춤"
                  >
                    <ChevronDown className="size-3" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => onUpdateTrackFlags(track.id, { visible: track.visible === false })}
                  className="rounded px-1 text-white/40 hover:bg-white/10 hover:text-white"
                  title={track.visible === false ? "숨김 — 미리보기에서 보이기" : "보임 — 미리보기에서 숨기기"}
                >
                  {track.visible === false ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                </button>
                <button
                  onClick={() => onUpdateTrackFlags(track.id, { locked: !track.locked })}
                  className="rounded px-1 text-white/40 hover:bg-white/10 hover:text-white"
                  title={track.locked ? "잠금 해제" : "잠금 — 편집/이동 방지"}
                >
                  {track.locked ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                </button>
                <button
                  onClick={() => onRemoveTrackGaps(track.id)}
                  className="rounded px-1 text-white/40 hover:bg-white/10 hover:text-white"
                  title="클립 사이 빈 공간 제거"
                >
                  <List className="size-3" />
                </button>
                <div className="ml-auto flex shrink-0 items-center gap-0.5">
                  <label
                    className="cursor-pointer rounded px-1 text-white/40 hover:bg-white/10 hover:text-white"
                    title="클립 추가(직접 업로드)"
                  >
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
                  {!track.autoSync && (
                    <button
                      onClick={() => onRemoveTrack(track.id)}
                      className="rounded px-1 text-white/40 hover:bg-white/10 hover:text-red-400"
                      title="트랙 삭제"
                    >
                      ×
                    </button>
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

          {timeline.tracks.map((track) => (
            <div key={track.id} className="relative h-14 border-b border-white/5">
              {track.clips.map((clip) => {
                const isPreview = preview?.clipId === clip.id;
                const startMs = isPreview ? preview!.startMs : clip.startMs;
                const endMs = isPreview ? preview!.endMs : clip.endMs;
                const left = (startMs / 1000) * pxPerSec;
                const width = Math.max(((endMs - startMs) / 1000) * pxPerSec, 2);
                const selected = selectedClipId === clip.id;
                const multiSelected = multiSelectedIds.has(clip.id) && !selected;
                return (
                  <div
                    key={clip.id}
                    title={clip.payload.label}
                    onMouseDown={(e) => handleClipMouseDown("move", track, clip, e)}
                    className={cn(
                      "absolute top-2 flex h-10 cursor-grab items-center overflow-hidden rounded-sm px-1 text-[10px] text-black/80 active:cursor-grabbing",
                      TRACK_COLORS[track.type],
                      selected && "ring-2 ring-white",
                      multiSelected && "ring-2 ring-sky-400",
                    )}
                    style={{ left, width }}
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
          ))}

          <div
            className="pointer-events-none absolute top-0 bottom-0 w-px bg-red-500"
            style={{ left: (playheadMs / 1000) * pxPerSec }}
          />
        </div>
      </div>
    </div>
  );
}
