import { computePerImageDurationSec } from "@/lib/video";

export type TimelineTrackType = "SUBTITLE" | "VIDEO" | "IMAGE" | "TTS" | "AUDIO" | "BGM";

export type TimelineClip = {
  id: string;
  startMs: number;
  endMs: number;
  label: string;
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

export type TimelineAudioSegmentInput = { id: string; text: string; startMs: number; endMs: number };
export type TimelineImageInput = { id: string; order: number };
export type TimelineBgmInput = { title: string; durationSec: number | null; loop: boolean };

// PROJECT_SPEC.md §1.3 "영상 탭 + 타임라인 편집기 Phase A": 별도 Timeline/Track/Clip 테이블 없이
// 기존 Script/ImageAsset/AudioSegment/BGM 설정으로부터 6개 트랙을 그때그때 계산한다.
export function buildTimelineTracks(input: {
  audioSegments: TimelineAudioSegmentInput[];
  images: TimelineImageInput[];
  bgm: TimelineBgmInput | null;
}): TimelineData {
  const durationMs =
    input.audioSegments.length > 0 ? input.audioSegments[input.audioSegments.length - 1].endMs : 0;

  const subtitleClips: TimelineClip[] = input.audioSegments.map((s) => ({
    id: `sub_${s.id}`,
    startMs: s.startMs,
    endMs: s.endMs,
    label: s.text,
  }));

  const ttsClips: TimelineClip[] = input.audioSegments.map((s) => ({
    id: `tts_${s.id}`,
    startMs: s.startMs,
    endMs: s.endMs,
    label: s.text.length > 20 ? `${s.text.slice(0, 20)}…` : s.text,
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

export function computeTimelineStats(timeline: TimelineData): TimelineStats {
  return {
    trackCount: timeline.tracks.length,
    totalClips: timeline.tracks.reduce((sum, t) => sum + t.clips.length, 0),
    durationSec: timeline.durationMs / 1000,
    clipCountsByTrack: timeline.tracks.map((t) => ({ name: t.name, count: t.clips.length })),
  };
}

export const MAX_RENDER_DURATION_SEC = 1800;

export type TimelineValidationResult = { valid: boolean; issues: string[] };

export function validateTimeline(timeline: TimelineData): TimelineValidationResult {
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
