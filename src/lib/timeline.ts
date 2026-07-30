import { computePerImageDurationSec } from "@/lib/video";

export type TimelineTrackType = "SUBTITLE" | "VIDEO" | "IMAGE" | "TTS" | "AUDIO" | "BGM" | "SFX";

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

// 자막 클립 스타일 — UI_SPEC.md §5.2 "자막 클립 > 스타일" 탭. 값이 없는 필드는 DEFAULT_SUBTITLE_STYLE로 대체된다.
export type SubtitleStyle = {
  fontFamily: string;
  fontSizePx: number;
  fontColor: string; // #RRGGBB
  bold: boolean;
  backgroundColor: string; // #RRGGBB
  backgroundOpacity: number; // 0~1
  positionXPx: number;
  positionYPx: number;
  borderWidthPx: number;
  borderColor: string; // #RRGGBB
  maxLineLength: number;
};

export const DEFAULT_SUBTITLE_STYLE_BASE: Omit<SubtitleStyle, "positionXPx" | "positionYPx"> = {
  fontFamily: "Nanum Gothic",
  fontSizePx: 75,
  fontColor: "#FFFFFF",
  bold: true,
  backgroundColor: "#000000",
  backgroundOpacity: 0.5,
  borderWidthPx: 2,
  borderColor: "#000000",
  maxLineLength: 25,
};

// 위치 기본값은 해상도 대비 상대값(가로 중앙, 세로 하단 쪽)이라 영상 포맷(SHORT/LONG)에 따라 달라진다.
export function resolveSubtitleStyle(
  partial: Partial<SubtitleStyle> | null | undefined,
  videoWidth: number,
  videoHeight: number,
): SubtitleStyle {
  const defaultPosition = { positionXPx: Math.round(videoWidth / 2), positionYPx: Math.round(videoHeight * 0.85) };
  return { ...DEFAULT_SUBTITLE_STYLE_BASE, ...defaultPosition, ...(partial ?? {}) };
}

// 비디오 클립 속성 — UI_SPEC.md §5.2 "비디오 클립" 서브탭. VIDEO 트랙은 아직 업로드 기능이 없어
// 실제로 선택 가능한 클립이 없지만, 속성 패널 UI/데이터 구조는 미리 구현해둔다(§1.3 6번 완료 후 연결).
export type VideoClipTransform = {
  x: number; // -1~2 정규화 좌표
  y: number;
  scale: number;
  rotationDeg: number;
  opacity: number; // 0~1
  flipH: boolean;
};

export const DEFAULT_VIDEO_TRANSFORM: VideoClipTransform = {
  x: 0.5,
  y: 0.5,
  scale: 1,
  rotationDeg: 0,
  opacity: 1,
  flipH: false,
};

export type VideoClipEffects = {
  colorPreset: string; // "none" | 프리셋 키
  brightness: number; // -1~1
  contrast: number;
  saturation: number;
  temperature: number;
};

export const DEFAULT_VIDEO_EFFECTS: VideoClipEffects = {
  colorPreset: "none",
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
};

export const COLOR_PRESETS = [
  { key: "none", label: "없음" },
  { key: "cinematic", label: "시네마틱" },
  { key: "neo-noir", label: "네오 느와르" },
  { key: "blue-steel", label: "블루 스틸" },
  { key: "golden-hour", label: "골든 아워" },
  { key: "retro-film", label: "레트로 필름" },
  { key: "sepia", label: "세피아" },
  { key: "faded", label: "페이디드" },
  { key: "polaroid", label: "폴라로이드" },
  { key: "vivid", label: "비비드" },
  { key: "hdr", label: "HDR 느낌" },
  { key: "pop-color", label: "팝 컬러" },
  { key: "warm", label: "따뜻한 톤" },
  { key: "cool", label: "차가운 톤" },
  { key: "golden-tone", label: "황금 톤" },
  { key: "bw-classic", label: "B&W 클래식" },
  { key: "bw-high-contrast", label: "B&W 하이콘트라스트" },
  { key: "film-noir", label: "필름 누아르" },
  { key: "soft-bw", label: "소프트 B&W" },
  { key: "dreamy", label: "몽환적" },
] as const;

export type TransitionType =
  | "none"
  | "fade"
  | "cut"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "wipe-left"
  | "wipe-right"
  | "wipe-up"
  | "wipe-down"
  | "diagonal-tl"
  | "diagonal-br"
  | "fade-black"
  | "fade-white";

export type VideoClipTransition = { type: TransitionType; durationMs: number };
export const DEFAULT_VIDEO_TRANSITION: VideoClipTransition = { type: "fade", durationMs: 1000 };

export type VideoClipOptions = { speed: number; flipH: boolean };
export const DEFAULT_VIDEO_OPTIONS: VideoClipOptions = { speed: 1, flipH: false };

export type VideoClipMask = {
  shape: "rect" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  featherPx: number;
  roundnessPct: number;
  inverted: boolean;
} | null;

export type KeyframeProperty = "positionX" | "positionY" | "scale" | "rotation";
export type Keyframe = { atMs: number; value: number };
export type VideoClipKeyframes = Partial<Record<KeyframeProperty, Keyframe[]>>;

// Phase B: GET/PATCH /api/projects/:id/timeline이 실제로 주고받는(영속화된) 클립 형태.
// 위 TimelineClip(Phase A "desired" 계산 결과)과 이름이 겹치지 않도록 Persisted 접두사를 붙인다.
export type PersistedClipPayload = {
  sourceId?: string;
  label: string;
  text?: string;
  // TTS 클립 전용: 트림(트림-시작)으로 잘려나간 만큼 원본 오디오 소스에서 건너뛸 시작 오프셋(ms).
  sourceOffsetMs?: number;
  // "직접 업로드"로 추가한 클립 전용: UploadedMedia.id 참조. sourceId(AudioSegment/ImageAsset 등
  // 자동 파이프라인 레코드)와는 별도 개념이라 필드를 분리했다 — 렌더링에는 아직 연결되지 않는다.
  mediaId?: string;
  mediaKind?: "video" | "image" | "audio";
  // 자막 클립 전용
  style?: Partial<SubtitleStyle>;
  // 비디오 클립 전용(현재는 VIDEO 트랙에 클립이 없어 미사용 — §1.3 6번 완료 후 연결)
  transform?: Partial<VideoClipTransform>;
  effects?: Partial<VideoClipEffects>;
  transition?: Partial<VideoClipTransition>;
  videoOptions?: Partial<VideoClipOptions>;
  mask?: VideoClipMask;
  keyframes?: VideoClipKeyframes;
};

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
  // true: syncTimeline이 관리하는 자동 트랙(타입당 최초 1개). false: "트랙 추가"로 사용자가 만든 트랙.
  autoSync: boolean;
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

// ── 렌더링: 편집(드래그/트림/삭제)으로 생긴 빈 구간을 실제 출력에서 어떻게 메울지 계산한다 ──────

export type ImageRenderSegment = { imagePath: string; durationSec: number };

// 이미지 클립 사이·앞뒤로 생긴 빈 구간은 "바로 앞 이미지가 계속 보이는" 방식으로 채운다(정지 이미지라
// 자연스럽게 이어 보임). 각 클립의 끝 시각(endMs)은 그대로 존중하고, 시작 지점만 커서 기준으로 당겨쓴다.
export function computeImageRenderSegments(
  clips: { startMs: number; endMs: number; imagePath: string }[],
  timelineDurationMs: number,
): ImageRenderSegment[] {
  const sorted = [...clips].sort((a, b) => a.startMs - b.startMs);
  const segments: ImageRenderSegment[] = [];
  let cursor = 0;
  sorted.forEach((clip, i) => {
    const next = sorted[i + 1];
    // 다음 클립(또는 타임라인 끝)이 이 클립의 endMs보다 뒤에서 시작하면 그 간격만큼 이 클립을 늘려 채운다.
    const effectiveEnd = Math.max(clip.endMs, next ? next.startMs : timelineDurationMs);
    segments.push({ imagePath: clip.imagePath, durationSec: Math.max(0, (effectiveEnd - cursor) / 1000) });
    cursor = effectiveEnd;
  });
  return segments;
}

export type AudioRenderSegment =
  | { type: "silence"; durationSec: number }
  | { type: "clip"; filePath: string; offsetSec: number; durationSec: number; needsTrim: boolean };

// TTS 클립 사이·앞뒤로 생긴 빈 구간(트림/삭제로 발생)은 무음으로 채워서, 최종 오디오 길이가 항상
// timelineDurationMs와 정확히 일치하도록 한다(합성 시 -shortest로 잘려나가는 것을 방지).
export function computeAudioRenderPlan(
  clips: { startMs: number; endMs: number; filePath: string; sourceOffsetMs: number; naturalDurationMs: number }[],
  timelineDurationMs: number,
): AudioRenderSegment[] {
  const sorted = [...clips].sort((a, b) => a.startMs - b.startMs);
  const segments: AudioRenderSegment[] = [];
  let cursor = 0;

  for (const clip of sorted) {
    if (clip.startMs > cursor) {
      segments.push({ type: "silence", durationSec: (clip.startMs - cursor) / 1000 });
    }
    const durationMs = clip.endMs - clip.startMs;
    const needsTrim = clip.sourceOffsetMs !== 0 || durationMs !== clip.naturalDurationMs;
    segments.push({
      type: "clip",
      filePath: clip.filePath,
      offsetSec: clip.sourceOffsetMs / 1000,
      durationSec: durationMs / 1000,
      needsTrim,
    });
    cursor = clip.endMs;
  }

  if (cursor < timelineDurationMs) {
    segments.push({ type: "silence", durationSec: (timelineDurationMs - cursor) / 1000 });
  }

  return segments;
}

// ── 트랙 편집 도구: 갭 제거 / 호흡구간 삽입 / 목표 길이 맞추기 ────────────────────────

export type ClipTimingUpdate = { id: string; startMs: number; endMs: number };

// "전체 갭 제거": 트랙의 모든 클립을 순서대로 빈틈없이 당겨 붙인다(첫 클립의 시작 위치부터).
export function removeGapsInClips(clips: { id: string; startMs: number; endMs: number }[]): ClipTimingUpdate[] {
  const sorted = [...clips].sort((a, b) => a.startMs - b.startMs);
  let cursor = sorted[0]?.startMs ?? 0;
  return sorted.map((c) => {
    const duration = c.endMs - c.startMs;
    const result = { id: c.id, startMs: cursor, endMs: cursor + duration };
    cursor += duration;
    return result;
  });
}

// 멀티 셀렉트 "선택 클립 사이 갭만 제거": 선택된 클립끼리만 첫 클립 위치부터 당겨 붙이고,
// 선택되지 않은 클립은 건드리지 않는다(선택 클립 사이에 비선택 클립이 끼어있는 경우는 겹칠 수 있음 — 알려진 단순화).
export function removeGapsBetweenSelectedClips(
  clips: { id: string; startMs: number; endMs: number }[],
  selectedIds: Set<string>,
): ClipTimingUpdate[] {
  const selected = clips.filter((c) => selectedIds.has(c.id)).sort((a, b) => a.startMs - b.startMs);
  if (selected.length === 0) return [];
  let cursor = selected[0].startMs;
  return selected.map((c) => {
    const duration = c.endMs - c.startMs;
    const result = { id: c.id, startMs: cursor, endMs: cursor + duration };
    cursor += duration;
    return result;
  });
}

// TTS 호흡구간 추가: 클립 사이(마지막 클립 뒤 제외)에 gapMs만큼 균일하게 벌리고, 이후 클립들을 누적으로 밀어낸다.
export function insertBreathingGaps(
  clips: { id: string; startMs: number; endMs: number }[],
  gapMs: number,
): ClipTimingUpdate[] {
  const sorted = [...clips].sort((a, b) => a.startMs - b.startMs);
  let shift = 0;
  return sorted.map((c, i) => {
    const result = { id: c.id, startMs: c.startMs + shift, endMs: c.endMs + shift };
    if (i < sorted.length - 1) shift += gapMs;
    return result;
  });
}

// 목표 길이 맞추기: 트랙 전체(0 ~ 마지막 클립 끝)를 targetDurationMs에 맞춰 원점 기준으로 비례 스케일한다.
export function scaleClipsToTargetDuration(
  clips: { id: string; startMs: number; endMs: number }[],
  targetDurationMs: number,
): ClipTimingUpdate[] {
  if (clips.length === 0) return [];
  const sorted = [...clips].sort((a, b) => a.startMs - b.startMs);
  const currentSpan = Math.max(...sorted.map((c) => c.endMs));
  if (currentSpan <= 0) return sorted.map((c) => ({ id: c.id, startMs: c.startMs, endMs: c.endMs }));
  const scale = targetDurationMs / currentSpan;
  return sorted.map((c) => ({ id: c.id, startMs: Math.round(c.startMs * scale), endMs: Math.round(c.endMs * scale) }));
}

// 클립 속성 패널 "기본 정보" 탭의 MM:SS.mmm 시간 편집 포맷(참조 사이트 동일 형식, 밀리초 3자리까지).
export function formatMmSsMs(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms));
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const msPart = totalMs % 1000;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(msPart).padStart(3, "0")}`;
}

export function parseMmSsMs(text: string): number | null {
  const match = text.trim().match(/^(\d{1,3}):(\d{1,2})\.(\d{1,3})$/);
  if (!match) return null;
  const [, mm, ss, ms] = match;
  if (Number(ss) >= 60) return null;
  return Number(mm) * 60000 + Number(ss) * 1000 + Number(ms.padEnd(3, "0").slice(0, 3));
}
