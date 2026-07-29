"use client";

import { cn } from "@/lib/utils";
import type { TimelineData, TimelineTrackType } from "@/lib/timeline";

const TRACK_COLORS: Record<TimelineTrackType, string> = {
  SUBTITLE: "bg-amber-400",
  VIDEO: "bg-purple-500",
  IMAGE: "bg-sky-500",
  TTS: "bg-emerald-500",
  AUDIO: "bg-orange-500",
  BGM: "bg-orange-400",
};

const BASE_PX_PER_SEC = 20;

function formatTimecode(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Phase A: 읽기 전용 시각화만 제공한다 (드래그/트림/분할은 Phase B).
export function TimelineTracks({ timeline, zoom }: { timeline: TimelineData; zoom: number }) {
  const pxPerSec = (BASE_PX_PER_SEC * zoom) / 100;
  const durationSec = timeline.durationMs / 1000;
  const totalWidth = Math.max(durationSec * pxPerSec, 400);

  const rulerMarks: number[] = [];
  const rulerStepSec = 30;
  for (let t = 0; t <= durationSec + rulerStepSec; t += rulerStepSec) {
    rulerMarks.push(t);
  }

  return (
    <div className="flex h-56 flex-col border-t border-white/10 bg-[#0d1017] text-xs text-white/80">
      <div className="flex items-center gap-3 border-b border-white/10 px-3 py-1.5 text-white/50">
        <span>
          {formatTimecode(0)} / {formatTimecode(durationSec)}
        </span>
        <span className="ml-auto">Zoom: {zoom}%</span>
      </div>

      <div className="flex flex-1 overflow-auto">
        <div className="sticky left-0 z-10 flex w-32 shrink-0 flex-col bg-[#0d1017]">
          <div className="h-6 shrink-0 border-b border-white/10" />
          {timeline.tracks.map((track) => (
            <div
              key={track.type}
              className="flex h-8 shrink-0 items-center gap-1.5 border-b border-white/5 px-2 text-white/70"
            >
              <span className={cn("size-2 rounded-full", TRACK_COLORS[track.type])} />
              <span className="truncate">{track.name}</span>
            </div>
          ))}
        </div>

        <div style={{ width: totalWidth }} className="relative">
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
            <div key={track.type} className="relative h-8 border-b border-white/5">
              {track.clips.map((clip) => {
                const left = (clip.startMs / 1000) * pxPerSec;
                const width = Math.max(((clip.endMs - clip.startMs) / 1000) * pxPerSec, 2);
                return (
                  <div
                    key={clip.id}
                    title={clip.label}
                    className={cn(
                      "absolute top-1 h-6 overflow-hidden rounded-sm px-1 text-[10px] leading-6 text-black/80",
                      TRACK_COLORS[track.type],
                    )}
                    style={{ left, width }}
                  >
                    {width > 24 ? clip.label : ""}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
