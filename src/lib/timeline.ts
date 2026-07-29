import { computePerImageDurationSec } from "@/lib/video";

export type TimelineTrackType = "SUBTITLE" | "VIDEO" | "IMAGE" | "TTS" | "AUDIO" | "BGM";

export type TimelineClip = {
  id: string;
  startMs: number;
  endMs: number;
  label: string;
  // 자막/TTS 원문 — 동기화 시 payload.text로 저장된다.
  text?: string;
  // 원본 레코드(AudioSegment/ImageAsset 등) ID. 동기화 매칭 키. BGM처럼 매칭이 불필요한 트랙은 없음.
  sourceId?: string;
};

export type TimelineTrack = {
  type: TimelineTrackType;
  name: string;
  clips: TimelineClip[];
};

export type TimelineData = {
  tracks: TimelineTrack[];
  durationMs: number;
};

// Phase B: GET/PATCH /api/projects/:id/timeline이 실제로 주고받는(영속화된) 클립 형태.
// 위 TimelineClip(Phase A "desired" 계산 결과)과 이름이 겹치지 않도록 Persisted 접두사를 붙인다.
export type PersistedClipPayload = { sourceId?: string; label: string; text?: string };

export type PersistedTimelineClip = {
  id: string;
  trackId: string;
  startMs: number;
  endMs: number;
  payload: PersistedClipPayload;
};

export type PersistedTimelineTrack = {
  id: string;
  type: TimelineTrackType;
  name: string;
  order: number;
  clips: PersistedTimelineClip[];
};

export type PersistedTimeline = {
  id: string;
  durationMs: number;
  tracks: PersistedTimelineTrack[];
};

export type TimelineAudioSegmentInput = { id: string; text: string; startMs: number; endMs: number };
export type TimelineImageInput = { id: string; order: number };
export type TimelineBgmInput = { title: string; durationSec: number | null; loop: boolean };

// PROJECT_SPEC.md §1.3 "타임라인 편집기 Phase A/B": Script/ImageAsset/AudioSegment/BGM 설정으로부터
// "동기화" 시 만들어야 할 이상적인(desired) 클립 목록을 계산한다. Phase A에서는 이 결과를 그대로
// 화면에 썼고, Phase B부터는 서버가 이 결과를 기존 저장된 클립과 diff(planClipSync)해 반영한다.
export function buildTimelineTracks(input: {
  audioSegments: TimelineAudioSegmentInput[];
  images: TimelineImageInput[];
  bgm: TimelineBgmInput | null;
}): TimelineData {
  const durationMs =
    input.audioSegments.length > 0 ? input.audioSegments[input.audioSegments.length - 1].endMs : 0;

  const subtitleClips: TimelineClip[] = input.audioSegments.map((s) => ({
    id: `sub_${s.id}`,
    sourceId: s.id,
    startMs: s.startMs,
    endMs: s.endMs,
    label: s.text,
    text: s.text,
  }));

  const ttsClips: TimelineClip[] = input.audioSegments.map((s) => ({
    id: `tts_${s.id}`,
    sourceId: s.id,
    startMs: s.startMs,
    endMs: s.endMs,
    label: s.text.length > 20 ? `${s.text.slice(0, 20)}…` : s.text,
    text: s.text,
  }));

  const imageClips: TimelineClip[] = [];
  if (input.images.length > 0 && durationMs > 0) {
    // renderVideo와 동일한 규칙(computePerImageDurationSec)으로 씬 길이를 균등 분배한다.
    const perImageMs = computePerImageDurationSec(durationMs, input.images.length) * 1000;
    input.images
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach((img, i) => {
        imageClips.push({
          id: `img_${img.id}`,
          sourceId: img.id,
          startMs: Math.round(i * perImageMs),
          endMs: Math.round((i + 1) * perImageMs),
          label: `Scene ${i + 1}`,
        });
      });
  }

  const bgmClips: TimelineClip[] = [];
  if (input.bgm && durationMs > 0) {
    const trackDurationMs = Math.max((input.bgm.durationSec ?? 30) * 1000, 1000);
    if (input.bgm.loop) {
      let cursor = 0;
      let i = 0;
      while (cursor < durationMs) {
        const end = Math.min(cursor + trackDurationMs, durationMs);
        bgmClips.push({ id: `bgm_${i}`, startMs: cursor, endMs: end, label: input.bgm.title });
        cursor = end;
        i++;
      }
    } else {
      bgmClips.push({ id: "bgm_0", startMs: 0, endMs: Math.min(trackDurationMs, durationMs), label: input.bgm.title });
    }
  }

  return {
    durationMs,
    tracks: [
      { type: "SUBTITLE", name: "Subtitles", clips: subtitleClips },
      { type: "VIDEO", name: "Video 1", clips: [] },
      { type: "IMAGE", name: "Image", clips: imageClips },
      { type: "TTS", name: "TTS", clips: ttsClips },
      { type: "AUDIO", name: "비디오 오디오", clips: [] },
      { type: "BGM", name: "BGM", clips: bgmClips },
    ],
  };
}

export type TimelineStats = {
  trackCount: number;
  totalClips: number;
  durationSec: number;
  clipCountsByTrack: { name: string; count: number }[];
};

export function computeTimelineStats(timeline: {
  durationMs: number;
  tracks: { name: string; clips: unknown[] }[];
}): TimelineStats {
  return {
    trackCount: timeline.tracks.length,
    totalClips: timeline.tracks.reduce((sum, t) => sum + t.clips.length, 0),
    durationSec: timeline.durationMs / 1000,
    clipCountsByTrack: timeline.tracks.map((t) => ({ name: t.name, count: t.clips.length })),
  };
}

export const MAX_RENDER_DURATION_SEC = 1800;

export type TimelineValidationResult = { valid: boolean; issues: string[] };

export function validateTimeline(timeline: { durationMs: number }): TimelineValidationResult {
  const issues: string[] = [];
  if (timeline.durationMs === 0) {
    issues.push("타임라인에 콘텐츠가 없습니다. 스크립트/이미지/TTS를 먼저 생성하세요.");
  }
  if (timeline.durationMs / 1000 > MAX_RENDER_DURATION_SEC) {
    issues.push(`최종 렌더링은 ${MAX_RENDER_DURATION_SEC}초로 제한됩니다. 이를 초과하는 구간은 자동으로 잘립니다.`);
  }
  return { valid: issues.length === 0, issues };
}

export const RECOMMENDED_SUBTITLE_CHARS_PER_LINE = 14;

export type SubtitleLineLengthResult = {
  exceedingIds: string[];
  maxLength: number;
};

// 참조 사이트 품질 분석의 "자막 줄 길이" 린트를 그대로 재현한다 (롱폼 한국어 자막 권장 14자/줄).
export function analyzeSubtitleLineLength(
  segments: { id: string; text: string }[],
  maxChars = RECOMMENDED_SUBTITLE_CHARS_PER_LINE,
): SubtitleLineLengthResult {
  let maxLength = 0;
  const exceedingIds: string[] = [];

  for (const segment of segments) {
    const longestLine = Math.max(...segment.text.split("\n").map((line) => line.length));
    maxLength = Math.max(maxLength, longestLine);
    if (longestLine > maxChars) {
      exceedingIds.push(segment.id);
    }
  }

  return { exceedingIds, maxLength };
}

// ── Phase B: 동기화 diff / 드래그·트림·분할 헬퍼 ──────────────────────────────

export type PersistedClipLite = {
  id: string;
  sourceId?: string | null;
  label: string;
  text?: string | null;
};

export type ClipSyncPlan = {
  toCreate: TimelineClip[];
  toUpdate: { id: string; label: string; text?: string }[];
  toDeleteIds: string[];
};

// PROJECT_SPEC.md §1.3 "동기화 로직": sourceId로 기존 클립과 desired 클립을 매칭해
// 존재하는 클립은 시간(사용자 편집)을 보존한 채 내용만 갱신하고, 원본이 사라진 클립은 삭제,
// 새로 생긴 원본은 생성 대상으로 분류한다. sourceId가 없는 클립(BGM 등)은 대상에서 제외한다.
export function planClipSync(existing: PersistedClipLite[], desired: TimelineClip[]): ClipSyncPlan {
  const existingBySourceId = new Map(
    existing.filter((c) => c.sourceId).map((c) => [c.sourceId as string, c]),
  );
  const desiredSourceIds = new Set(desired.filter((d) => d.sourceId).map((d) => d.sourceId as string));

  const toCreate: TimelineClip[] = [];
  const toUpdate: { id: string; label: string; text?: string }[] = [];

  for (const d of desired) {
    if (!d.sourceId) continue;
    const match = existingBySourceId.get(d.sourceId);
    if (match) {
      if (match.label !== d.label || (match.text ?? undefined) !== d.text) {
        toUpdate.push({ id: match.id, label: d.label, text: d.text });
      }
    } else {
      toCreate.push(d);
    }
  }

  const toDeleteIds = existing
    .filter((c) => c.sourceId && !desiredSourceIds.has(c.sourceId))
    .map((c) => c.id);

  return { toCreate, toUpdate, toDeleteIds };
}

export function snapToGrid(ms: number, intervalMs: number): number {
  if (intervalMs <= 0) return Math.round(ms);
  return Math.round(ms / intervalMs) * intervalMs;
}

// 같은 트랙 내 드래그/트림 결과를 [minMs, maxMs] 범위(보통 이웃 클립 경계) 안으로 클램프한다.
// 길이(duration)는 유지한 채 위치만 조정한다.
export function clampClipTiming(input: {
  startMs: number;
  endMs: number;
  minMs: number;
  maxMs: number;
}): { startMs: number; endMs: number } {
  const duration = input.endMs - input.startMs;
  const startMs = Math.max(input.minMs, Math.min(input.startMs, input.maxMs - duration));
  return { startMs, endMs: startMs + duration };
}

export const MIN_CLIP_DURATION_MS = 100;

// 트림(양끝 조절바 드래그): duration이 바뀔 수 있다는 점이 drag(clampClipTiming)와 다르다.
export function clampTrimStart(input: {
  startMs: number;
  endMs: number;
  minMs: number;
  minDurationMs?: number;
}): number {
  const minDuration = input.minDurationMs ?? MIN_CLIP_DURATION_MS;
  return Math.max(input.minMs, Math.min(input.startMs, input.endMs - minDuration));
}

export function clampTrimEnd(input: {
  startMs: number;
  endMs: number;
  maxMs: number;
  minDurationMs?: number;
}): number {
  const minDuration = input.minDurationMs ?? MIN_CLIP_DURATION_MS;
  return Math.min(input.maxMs, Math.max(input.endMs, input.startMs + minDuration));
}

export type SplitResult = { first: { startMs: number; endMs: number }; second: { startMs: number; endMs: number } };

// 재생헤드가 클립 내부(양끝 제외)에 있을 때만 분할 가능하다.
export function computeSplitTimes(clip: { startMs: number; endMs: number }, atMs: number): SplitResult | null {
  if (atMs <= clip.startMs || atMs >= clip.endMs) return null;
  return {
    first: { startMs: clip.startMs, endMs: atMs },
    second: { startMs: atMs, endMs: clip.endMs },
  };
}

function wrapLine(line: string, maxChars: number): string {
  if (line.length <= maxChars) return line;
  const words = line.split(" ");
  const outLines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      outLines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) outLines.push(current);
  return outLines.join("\n");
}

// 품질 분석 "자막 줄 길이" 원클릭 수정: 클립 개수·타이밍은 그대로 두고 글자수 기준으로만 줄바꿈을 넣는다.
export function rewrapTextToMaxLineLength(text: string, maxChars = RECOMMENDED_SUBTITLE_CHARS_PER_LINE): string {
  return text
    .split("\n")
    .map((line) => wrapLine(line, maxChars))
    .join("\n");
}
