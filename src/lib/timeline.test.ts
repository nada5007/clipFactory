import { describe, expect, it } from "vitest";

import {
  analyzeSubtitleLineLength,
  buildTimelineTracks,
  clampClipTiming,
  clampTrimEnd,
  clampTrimStart,
  computeAudioRenderPlan,
  computeImageRenderSegments,
  computeSplitTimes,
  computeTimelineStats,
  planClipSync,
  rewrapTextToMaxLineLength,
  snapToGrid,
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

describe("planClipSync", () => {
  it("sourceId가 매칭되면 기존 클립의 시간은 두고 내용이 다를 때만 업데이트 대상에 넣는다", () => {
    const existing = [{ id: "persisted-1", sourceId: "seg-a", label: "옛 텍스트", text: "옛 텍스트" }];
    const desired = [
      { id: "sub_seg-a", sourceId: "seg-a", startMs: 0, endMs: 1000, label: "새 텍스트", text: "새 텍스트" },
    ];

    const plan = planClipSync(existing, desired);

    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toDeleteIds).toHaveLength(0);
    expect(plan.toUpdate).toEqual([{ id: "persisted-1", label: "새 텍스트", text: "새 텍스트" }]);
  });

  it("내용이 동일하면 업데이트 대상에 넣지 않는다(기존 편집 보존)", () => {
    const existing = [{ id: "persisted-1", sourceId: "seg-a", label: "텍스트", text: "텍스트" }];
    const desired = [
      { id: "sub_seg-a", sourceId: "seg-a", startMs: 500, endMs: 1500, label: "텍스트", text: "텍스트" },
    ];

    const plan = planClipSync(existing, desired);
    expect(plan.toUpdate).toHaveLength(0);
  });

  it("desired에만 있는 sourceId는 생성 대상이다", () => {
    const desired = [{ id: "sub_seg-new", sourceId: "seg-new", startMs: 0, endMs: 1000, label: "새 문장" }];
    const plan = planClipSync([], desired);
    expect(plan.toCreate).toEqual(desired);
  });

  it("existing에만 있는 sourceId는 삭제 대상이다", () => {
    const existing = [{ id: "persisted-orphan", sourceId: "seg-removed", label: "삭제된 문장" }];
    const plan = planClipSync(existing, []);
    expect(plan.toDeleteIds).toEqual(["persisted-orphan"]);
  });

  it("sourceId가 없는 클립(BGM 등)은 생성/삭제/업데이트 어디에도 포함하지 않는다", () => {
    const desired = [{ id: "bgm_0", startMs: 0, endMs: 1000, label: "곡" }];
    const plan = planClipSync([], desired);
    expect(plan.toCreate).toHaveLength(0);
  });
});

describe("snapToGrid", () => {
  it("가장 가까운 간격 단위로 반올림한다", () => {
    expect(snapToGrid(1040, 100)).toBe(1000);
    expect(snapToGrid(1060, 100)).toBe(1100);
  });

  it("간격이 0 이하이면 그대로 반환한다", () => {
    expect(snapToGrid(1234, 0)).toBe(1234);
  });
});

describe("clampClipTiming", () => {
  it("범위 안이면 그대로 유지한다", () => {
    const result = clampClipTiming({ startMs: 1000, endMs: 2000, minMs: 0, maxMs: 5000 });
    expect(result).toEqual({ startMs: 1000, endMs: 2000 });
  });

  it("최소 경계를 넘으면 길이를 유지한 채 앞으로 당긴다", () => {
    const result = clampClipTiming({ startMs: -500, endMs: 500, minMs: 0, maxMs: 5000 });
    expect(result).toEqual({ startMs: 0, endMs: 1000 });
  });

  it("최대 경계(이웃 클립)를 넘으면 길이를 유지한 채 뒤로 밀어낸다", () => {
    const result = clampClipTiming({ startMs: 4800, endMs: 5800, minMs: 0, maxMs: 5000 });
    expect(result).toEqual({ startMs: 4000, endMs: 5000 });
  });
});

describe("clampTrimStart / clampTrimEnd", () => {
  it("최소 경계 안쪽이면 그대로 둔다", () => {
    expect(clampTrimStart({ startMs: 500, endMs: 2000, minMs: 0 })).toBe(500);
    expect(clampTrimEnd({ startMs: 500, endMs: 2000, maxMs: 5000 })).toBe(2000);
  });

  it("최소 경계를 넘으면 경계값으로 클램프한다", () => {
    expect(clampTrimStart({ startMs: -200, endMs: 2000, minMs: 0 })).toBe(0);
  });

  it("최소 길이(기본 100ms) 밑으로는 줄어들지 않는다", () => {
    expect(clampTrimStart({ startMs: 1950, endMs: 2000, minMs: 0 })).toBe(1900);
    expect(clampTrimEnd({ startMs: 1000, endMs: 1050, maxMs: 5000 })).toBe(1100);
  });
});

describe("computeSplitTimes", () => {
  it("클립 내부 지점이면 둘로 나눈다", () => {
    const result = computeSplitTimes({ startMs: 1000, endMs: 3000 }, 2000);
    expect(result).toEqual({ first: { startMs: 1000, endMs: 2000 }, second: { startMs: 2000, endMs: 3000 } });
  });

  it("클립 양끝이나 바깥이면 null을 반환한다", () => {
    expect(computeSplitTimes({ startMs: 1000, endMs: 3000 }, 1000)).toBeNull();
    expect(computeSplitTimes({ startMs: 1000, endMs: 3000 }, 3000)).toBeNull();
    expect(computeSplitTimes({ startMs: 1000, endMs: 3000 }, 500)).toBeNull();
  });
});

describe("rewrapTextToMaxLineLength", () => {
  it("기준 글자수를 넘는 줄에만 줄바꿈을 넣는다", () => {
    const result = rewrapTextToMaxLineLength("이것은 열네 글자를 훌쩍 넘기는 긴 자막입니다", 14);
    expect(result.split("\n").every((line) => line.length <= 14)).toBe(true);
  });

  it("이미 기준 이내면 그대로 둔다", () => {
    expect(rewrapTextToMaxLineLength("짧은 자막", 14)).toBe("짧은 자막");
  });
});

describe("computeImageRenderSegments", () => {
  it("클립 사이 빈 구간은 앞 이미지가 계속 보이도록 채운다", () => {
    const segments = computeImageRenderSegments(
      [
        { startMs: 0, endMs: 1000, imagePath: "a.png" },
        { startMs: 1500, endMs: 3000, imagePath: "b.png" }, // 1000~1500 트림으로 생긴 빈 구간
      ],
      3000,
    );
    expect(segments).toEqual([
      { imagePath: "a.png", durationSec: 1.5 }, // 원래 1초 + 빈 구간 0.5초를 흡수
      { imagePath: "b.png", durationSec: 1.5 },
    ]);
  });

  it("마지막 클립은 타임라인 전체 길이까지 늘어난다", () => {
    const segments = computeImageRenderSegments([{ startMs: 0, endMs: 2000, imagePath: "a.png" }], 3000);
    expect(segments).toEqual([{ imagePath: "a.png", durationSec: 3 }]);
  });
});

describe("computeAudioRenderPlan", () => {
  it("트림/삭제로 생긴 빈 구간에 무음을 삽입해 전체 길이를 맞춘다", () => {
    const plan = computeAudioRenderPlan(
      [
        { startMs: 500, endMs: 1500, filePath: "a.mp3", sourceOffsetMs: 0, naturalDurationMs: 1000 },
        { startMs: 2000, endMs: 2500, filePath: "b.mp3", sourceOffsetMs: 0, naturalDurationMs: 500 },
      ],
      3000,
    );
    expect(plan).toEqual([
      { type: "silence", durationSec: 0.5 }, // 0~500 선행 공백
      { type: "clip", filePath: "a.mp3", offsetSec: 0, durationSec: 1, needsTrim: false },
      { type: "silence", durationSec: 0.5 }, // 1500~2000
      { type: "clip", filePath: "b.mp3", offsetSec: 0, durationSec: 0.5, needsTrim: false },
      { type: "silence", durationSec: 0.5 }, // 2500~3000 후행 공백
    ]);
  });

  it("트림으로 원본과 길이/오프셋이 달라지면 needsTrim을 표시한다", () => {
    const plan = computeAudioRenderPlan(
      [{ startMs: 0, endMs: 800, filePath: "a.mp3", sourceOffsetMs: 200, naturalDurationMs: 1000 }],
      800,
    );
    expect(plan).toEqual([{ type: "clip", filePath: "a.mp3", offsetSec: 0.2, durationSec: 0.8, needsTrim: true }]);
  });

  it("빈 구간이 없으면 무음 없이 클립만 이어진다", () => {
    const plan = computeAudioRenderPlan(
      [{ startMs: 0, endMs: 1000, filePath: "a.mp3", sourceOffsetMs: 0, naturalDurationMs: 1000 }],
      1000,
    );
    expect(plan).toEqual([{ type: "clip", filePath: "a.mp3", offsetSec: 0, durationSec: 1, needsTrim: false }]);
  });
});
