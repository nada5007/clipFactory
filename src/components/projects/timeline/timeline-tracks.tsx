"use client";

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

export function TimelineTracks({
  timeline,
  zoom,
  selectedClipId,
  playheadMs,
  snapEnabled,
  snapIntervalMs,
  onSelectClip,
  onSeek,
  onCommitTiming,
}: {
  timeline: PersistedTimeline;
  zoom: number;
  selectedClipId: string | null;
  playheadMs: number;
  snapEnabled: boolean;
  snapIntervalMs: number;
  onSelectClip: (clipId: string | null) => void;
  onSeek: (ms: number) => void;
  onCommitTiming: (clipId: string, startMs: number, endMs: number) => void;
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

  function beginInteraction(
    mode: InteractionMode,
    track: PersistedTimelineTrack,
    clip: PersistedTimelineClip,
    e: React.MouseEvent,
  ) {
    e.stopPropagation();
    e.preventDefault();
    onSelectClip(clip.id);

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
    onSelectClip(null);
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
        <div className="sticky left-0 z-10 flex w-32 shrink-0 flex-col bg-[#0d1017]">
          <div className="h-6 shrink-0 border-b border-white/10" />
          {timeline.tracks.map((track) => (
            <div
              key={track.id}
              className="flex h-8 shrink-0 items-center gap-1.5 border-b border-white/5 px-2 text-white/70"
            >
              <span className={cn("size-2 rounded-full", TRACK_COLORS[track.type])} />
              <span className="truncate">{track.name}</span>
            </div>
          ))}
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
            <div key={track.id} className="relative h-8 border-b border-white/5">
              {track.clips.map((clip) => {
                const isPreview = preview?.clipId === clip.id;
                const startMs = isPreview ? preview!.startMs : clip.startMs;
                const endMs = isPreview ? preview!.endMs : clip.endMs;
                const left = (startMs / 1000) * pxPerSec;
                const width = Math.max(((endMs - startMs) / 1000) * pxPerSec, 2);
                const selected = selectedClipId === clip.id;
                return (
                  <div
                    key={clip.id}
                    title={clip.payload.label}
                    onMouseDown={(e) => beginInteraction("move", track, clip, e)}
                    className={cn(
                      "absolute top-1 h-6 cursor-grab overflow-hidden rounded-sm px-1 text-[10px] leading-6 text-black/80 active:cursor-grabbing",
                      TRACK_COLORS[track.type],
                      selected && "ring-2 ring-white",
                    )}
                    style={{ left, width }}
                  >
                    {width > 24 ? clip.payload.label : ""}
                    <div
                      onMouseDown={(e) => beginInteraction("trim-start", track, clip, e)}
                      className="absolute inset-y-0 left-0 cursor-ew-resize"
                      style={{ width: TRIM_HANDLE_PX }}
                    />
                    <div
                      onMouseDown={(e) => beginInteraction("trim-end", track, clip, e)}
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
