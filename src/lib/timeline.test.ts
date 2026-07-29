import { describe, expect, it } from "vitest";

import {
  analyzeSubtitleLineLength,
  buildTimelineTracks,
  computeTimelineStats,
  validateTimeline,
} from "@/lib/timeline";

describe("buildTimelineTracks", () => {
  it("오디오 세그먼트로 Subtitles/TTS 트랙을 만들고 전체 길이를 마지막 세그먼트 끝으로 잡는다", () => {
    const timeline = buildTimelineTracks({
      audioSegments: [
        { id: "a", text: "첫 문장", startMs: 0, endMs: 1000 },
        { id: "b", text: "둘째 문장", startMs: 1000, endMs: 2500 },
      ],
      images: [],
      bgm: null,
    });

    expect(timeline.durationMs).toBe(2500);
    const subtitle = timeline.tracks.find((t) => t.type === "SUBTITLE")!;
    expect(subtitle.clips).toHaveLength(2);
    expect(subtitle.clips[1]).toMatchObject({ startMs: 1000, endMs: 2500, label: "둘째 문장" });
  });

  it("이미지는 순번대로 전체 길이를 균등 분배한다", () => {
    const timeline = buildTimelineTracks({
      audioSegments: [{ id: "a", text: "문장", startMs: 0, endMs: 4000 }],
      images: [
        { id: "img2", order: 1 },
        { id: "img1", order: 0 },
      ],
      bgm: null,
    });

    const imageTrack = timeline.tracks.find((t) => t.type === "IMAGE")!;
    expect(imageTrack.clips).toHaveLength(2);
    expect(imageTrack.clips[0]).toMatchObject({ id: "img_img1", startMs: 0, endMs: 2000 });
    expect(imageTrack.clips[1]).toMatchObject({ id: "img_img2", startMs: 2000, endMs: 4000 });
  });

  it("Video 1과 비디오 오디오 트랙은 항상 비어있다", () => {
    const timeline = buildTimelineTracks({
      audioSegments: [{ id: "a", text: "문장", startMs: 0, endMs: 1000 }],
      images: [],
      bgm: null,
    });

    expect(timeline.tracks.find((t) => t.type === "VIDEO")!.clips).toEqual([]);
    expect(timeline.tracks.find((t) => t.type === "AUDIO")!.clips).toEqual([]);
  });

  it("BGM이 반복 재생이면 전체 길이를 채울 때까지 클립을 반복 배치한다", () => {
    const timeline = buildTimelineTracks({
      audioSegments: [{ id: "a", text: "문장", startMs: 0, endMs: 7000 }],
      images: [],
      bgm: { title: "천천히 드러나는 장면", durationSec: 3, loop: true },
    });

    const bgmTrack = timeline.tracks.find((t) => t.type === "BGM")!;
    expect(bgmTrack.clips.map((c) => [c.startMs, c.endMs])).toEqual([
      [0, 3000],
      [3000, 6000],
      [6000, 7000],
    ]);
  });

  it("BGM이 반복 재생이 아니면 한 번만 배치한다", () => {
    const timeline = buildTimelineTracks({
      audioSegments: [{ id: "a", text: "문장", startMs: 0, endMs: 7000 }],
      images: [],
      bgm: { title: "곡", durationSec: 3, loop: false },
    });

    const bgmTrack = timeline.tracks.find((t) => t.type === "BGM")!;
    expect(bgmTrack.clips).toHaveLength(1);
    expect(bgmTrack.clips[0]).toMatchObject({ startMs: 0, endMs: 3000 });
  });
});

describe("computeTimelineStats", () => {
  it("트랙 개수/총 클립/길이/트랙별 개수를 집계한다", () => {
    const timeline = buildTimelineTracks({
      audioSegments: [{ id: "a", text: "문장", startMs: 0, endMs: 2000 }],
      images: [{ id: "img1", order: 0 }],
      bgm: null,
    });

    const stats = computeTimelineStats(timeline);
    expect(stats.trackCount).toBe(6);
    expect(stats.durationSec).toBe(2);
    expect(stats.totalClips).toBe(3); // subtitle 1 + image 1 + tts 1
  });
});

describe("validateTimeline", () => {
  it("콘텐츠가 없으면 유효하지 않다", () => {
    const timeline = buildTimelineTracks({ audioSegments: [], images: [], bgm: null });
    const result = validateTimeline(timeline);
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toContain("콘텐츠가 없습니다");
  });

  it("1800초를 초과하면 이슈를 보고한다", () => {
    const timeline = buildTimelineTracks({
      audioSegments: [{ id: "a", text: "긴 문장", startMs: 0, endMs: 1_900_000 }],
      images: [],
      bgm: null,
    });
    const result = validateTimeline(timeline);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("1800초"))).toBe(true);
  });

  it("정상 범위면 유효하다", () => {
    const timeline = buildTimelineTracks({
      audioSegments: [{ id: "a", text: "문장", startMs: 0, endMs: 5000 }],
      images: [],
      bgm: null,
    });
    expect(validateTimeline(timeline)).toEqual({ valid: true, issues: [] });
  });
});

describe("analyzeSubtitleLineLength", () => {
  it("권장 글자수를 초과하는 세그먼트를 찾아낸다", () => {
    const result = analyzeSubtitleLineLength([
      { id: "1", text: "짧은 자막" },
      { id: "2", text: "이것은 열네 글자를 훌쩍 넘기는 긴 자막입니다" },
    ]);

    expect(result.exceedingIds).toEqual(["2"]);
    expect(result.maxLength).toBeGreaterThan(14);
  });

  it("줄바꿈이 있으면 가장 긴 줄 기준으로 판단한다", () => {
    const result = analyzeSubtitleLineLength([{ id: "1", text: "짧음\n이것은열네글자를훌쩍넘기는훨씬더긴줄입니다" }]);
    expect(result.exceedingIds).toEqual(["1"]);
  });

  it("전부 기준 이내면 빈 배열을 반환한다", () => {
    const result = analyzeSubtitleLineLength([{ id: "1", text: "짧은 자막" }]);
    expect(result.exceedingIds).toEqual([]);
  });
});
