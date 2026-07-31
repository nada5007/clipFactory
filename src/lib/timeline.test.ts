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
  computeRulerStepSec,
  computeTimelineStats,
  computeCoveredClipIds,
  findClipAtMsByPriority,
  findTopClipAtMs,
  formatMmSsMs,
  insertBreathingGaps,
  parseMmSsMs,
  planClipSync,
  removeGapsBetweenSelectedClips,
  removeGapsInClips,
  resolveImageEffectsFilter,
  resolveImageKenBurnsTransform,
  rewrapTextToMaxLineLength,
  scaleClipsToTargetDuration,
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

describe("removeGapsInClips", () => {
  it("모든 클립을 첫 클립 위치부터 빈틈없이 당겨 붙인다", () => {
    const result = removeGapsInClips([
      { id: "a", startMs: 500, endMs: 1000 },
      { id: "b", startMs: 2000, endMs: 2500 },
      { id: "c", startMs: 4000, endMs: 4200 },
    ]);
    expect(result).toEqual([
      { id: "a", startMs: 500, endMs: 1000 },
      { id: "b", startMs: 1000, endMs: 1500 },
      { id: "c", startMs: 1500, endMs: 1700 },
    ]);
  });
});

describe("removeGapsBetweenSelectedClips", () => {
  it("선택된 클립끼리만 첫 선택 클립 위치부터 당겨 붙인다", () => {
    const clips = [
      { id: "a", startMs: 0, endMs: 500 },
      { id: "b", startMs: 1000, endMs: 1500 }, // 선택
      { id: "c", startMs: 2000, endMs: 2200 }, // 선택
    ];
    const result = removeGapsBetweenSelectedClips(clips, new Set(["b", "c"]));
    expect(result).toEqual([
      { id: "b", startMs: 1000, endMs: 1500 },
      { id: "c", startMs: 1500, endMs: 1700 },
    ]);
  });
});

describe("insertBreathingGaps", () => {
  it("마지막 클립을 제외한 클립 뒤에 간격을 넣고 이후 클립을 누적으로 밀어낸다", () => {
    const result = insertBreathingGaps(
      [
        { id: "a", startMs: 0, endMs: 1000 },
        { id: "b", startMs: 1000, endMs: 2000 },
        { id: "c", startMs: 2000, endMs: 2500 },
      ],
      300,
    );
    expect(result).toEqual([
      { id: "a", startMs: 0, endMs: 1000 },
      { id: "b", startMs: 1300, endMs: 2300 },
      { id: "c", startMs: 2600, endMs: 3100 },
    ]);
  });
});

describe("scaleClipsToTargetDuration", () => {
  it("전체 구간을 목표 길이에 맞춰 원점 기준으로 비례 스케일한다", () => {
    const result = scaleClipsToTargetDuration(
      [
        { id: "a", startMs: 0, endMs: 1000 },
        { id: "b", startMs: 1000, endMs: 2000 },
      ],
      4000,
    );
    expect(result).toEqual([
      { id: "a", startMs: 0, endMs: 2000 },
      { id: "b", startMs: 2000, endMs: 4000 },
    ]);
  });
});

describe("formatMmSsMs / parseMmSsMs", () => {
  it("ms를 MM:SS.mmm 형식으로 포맷한다", () => {
    expect(formatMmSsMs(64560)).toBe("01:04.560");
    expect(formatMmSsMs(0)).toBe("00:00.000");
    expect(formatMmSsMs(3504)).toBe("00:03.504");
  });

  it("MM:SS.mmm 문자열을 ms로 되돌린다(왕복 변환)", () => {
    expect(parseMmSsMs("01:04.560")).toBe(64560);
    expect(parseMmSsMs(formatMmSsMs(123456))).toBe(123456);
  });

  it("초가 60 이상이거나 형식이 어긋나면 null을 반환한다", () => {
    expect(parseMmSsMs("01:60.000")).toBeNull();
    expect(parseMmSsMs("not-a-time")).toBeNull();
    expect(parseMmSsMs("")).toBeNull();
  });
});

describe("resolveImageEffectsFilter", () => {
  it("effects가 없으면 프리셋 없음 + 항등 슬라이더 필터를 반환한다", () => {
    const filter = resolveImageEffectsFilter(undefined);
    expect(filter).toContain("brightness(1.00)");
    expect(filter).toContain("contrast(1.00)");
    expect(filter).toContain("saturate(1.00)");
    expect(filter).toContain("hue-rotate(0.0deg)");
  });

  it("색보정 프리셋별로 다른 필터 문자열을 반환한다", () => {
    const none = resolveImageEffectsFilter({ colorPreset: "none" });
    const bw = resolveImageEffectsFilter({ colorPreset: "bw-classic" });
    expect(bw).toContain("grayscale(1)");
    expect(bw).not.toBe(none);
  });

  it("밝기/대비/채도/색온도 슬라이더 값을 필터에 반영한다", () => {
    const filter = resolveImageEffectsFilter({ brightness: 0.4, contrast: -0.2, saturation: 1, temperature: -1 });
    expect(filter).toContain("brightness(1.20)");
    expect(filter).toContain("contrast(0.90)");
    expect(filter).toContain("saturate(1.70)");
    expect(filter).toContain("hue-rotate(15.0deg)");
  });

  it("채도 슬라이더가 음수로 크게 내려가도 0 미만으로 떨어지지 않는다", () => {
    const filter = resolveImageEffectsFilter({ saturation: -1 });
    expect(filter).toContain("saturate(0.30)");
  });
});

describe("resolveImageKenBurnsTransform", () => {
  it("패닝/줌이 모두 꺼져 있으면 빈 문자열을 반환한다", () => {
    expect(resolveImageKenBurnsTransform(undefined, "clip-1", 0.5)).toBe("");
  });

  it("줌 인은 진행률에 따라 1배에서 강도까지 커진다", () => {
    const effects = { zoomEnabled: true, zoomType: "in" as const, zoomIntensity: 1.5 };
    expect(resolveImageKenBurnsTransform(effects, "clip-1", 0)).toContain("scale(1.000)");
    expect(resolveImageKenBurnsTransform(effects, "clip-1", 1)).toContain("scale(1.500)");
  });

  it("줌 아웃은 진행률에 따라 강도에서 1배로 줄어든다", () => {
    const effects = { zoomEnabled: true, zoomType: "out" as const, zoomIntensity: 1.5 };
    expect(resolveImageKenBurnsTransform(effects, "clip-1", 0)).toContain("scale(1.500)");
    expect(resolveImageKenBurnsTransform(effects, "clip-1", 1)).toContain("scale(1.000)");
  });

  it("진행률은 0~1로 clamp된다", () => {
    const effects = { zoomEnabled: true, zoomType: "in" as const, zoomIntensity: 2 };
    expect(resolveImageKenBurnsTransform(effects, "clip-1", -5)).toContain("scale(1.000)");
    expect(resolveImageKenBurnsTransform(effects, "clip-1", 5)).toContain("scale(2.000)");
  });

  it("패닝 방향이 random이 아니면 지정한 방향으로 이동한다", () => {
    const left = resolveImageKenBurnsTransform({ panEnabled: true, panDirection: "left" }, "clip-1", 1);
    const right = resolveImageKenBurnsTransform({ panEnabled: true, panDirection: "right" }, "clip-1", 1);
    expect(left).not.toBe(right);
  });

  it("같은 클립 ID의 random 방향은 호출할 때마다 동일하게 유지된다", () => {
    const a = resolveImageKenBurnsTransform({ panEnabled: true, panDirection: "random" }, "clip-xyz", 1);
    const b = resolveImageKenBurnsTransform({ panEnabled: true, panDirection: "random" }, "clip-xyz", 1);
    expect(a).toBe(b);
  });
});

function makeClip(id: string, startMs: number, endMs: number, zIndex = 0) {
  return { id, trackId: "x", startMs, endMs, zIndex, payload: { label: id } };
}

describe("findTopClipAtMs", () => {
  it("한 시각을 덮는 클립이 하나뿐이면 그것을 반환한다", () => {
    const clips = [makeClip("a", 0, 1000)];
    expect(findTopClipAtMs(clips, 500)?.id).toBe("a");
  });

  it("여러 클립이 겹치면 zIndex가 가장 높은 클립을 반환한다", () => {
    const clips = [makeClip("old", 0, 1000, 0), makeClip("new", 200, 800, 1)];
    expect(findTopClipAtMs(clips, 500)?.id).toBe("new");
  });

  it("겹친 클립의 시간 밖에서는(zIndex 무관) 그 시각을 덮는 클립만 반환한다", () => {
    const clips = [makeClip("old", 0, 1000, 0), makeClip("new", 200, 800, 1)];
    // "new"는 800ms까지만 덮으므로 900ms 시점엔 "old"가 보여야 한다(위 트랙에 클립이 없는 구간과 동일한 원리).
    expect(findTopClipAtMs(clips, 900)?.id).toBe("old");
  });

  it("아무 클립도 그 시각을 덮지 않으면 null을 반환한다", () => {
    expect(findTopClipAtMs([makeClip("a", 0, 500)], 900)).toBeNull();
  });
});

describe("computeCoveredClipIds", () => {
  it("겹치지 않으면 아무도 가려지지 않는다", () => {
    const clips = [makeClip("a", 0, 500, 0), makeClip("b", 500, 1000, 1)];
    expect(computeCoveredClipIds(clips).size).toBe(0);
  });

  it("겹치면 zIndex가 낮은 쪽이 가려진 것으로 표시된다", () => {
    const clips = [makeClip("old", 0, 1000, 0), makeClip("new", 200, 800, 1)];
    const covered = computeCoveredClipIds(clips);
    expect(covered.has("old")).toBe(true);
    expect(covered.has("new")).toBe(false);
  });
});

describe("findClipAtMsByPriority", () => {
  function clip(id: string, startMs: number, endMs: number) {
    return { id, trackId: "x", startMs, endMs, zIndex: 0, payload: { label: id } };
  }

  it("상위(order가 가장 작은) 트랙에 그 시각을 덮는 클립이 있으면 그것을 쓴다", () => {
    const tracks = [
      { type: "IMAGE" as const, order: 0, visible: true, clips: [clip("top", 0, 1000)] },
      { type: "IMAGE" as const, order: 1, visible: true, clips: [clip("bottom", 0, 1000)] },
    ];
    expect(findClipAtMsByPriority(tracks, ["IMAGE"], 500)?.clip.id).toBe("top");
  });

  it("상위 트랙에 그 시각을 덮는 클립이 없으면 다음 우선순위 트랙으로 내려간다", () => {
    const tracks = [
      { type: "IMAGE" as const, order: 0, visible: true, clips: [clip("top", 0, 500)] },
      { type: "IMAGE" as const, order: 1, visible: true, clips: [clip("bottom", 0, 1000)] },
    ];
    // top 트랙은 500ms까지만 클립이 있어 그 뒤(700ms)는 bottom 트랙이 비쳐 보여야 한다.
    expect(findClipAtMsByPriority(tracks, ["IMAGE"], 700)?.clip.id).toBe("bottom");
  });

  it("숨긴(visible=false) 트랙은 우선순위가 높아도 건너뛴다", () => {
    const tracks = [
      { type: "IMAGE" as const, order: 0, visible: false, clips: [clip("hidden", 0, 1000)] },
      { type: "IMAGE" as const, order: 1, visible: true, clips: [clip("visible", 0, 1000)] },
    ];
    expect(findClipAtMsByPriority(tracks, ["IMAGE"], 500)?.clip.id).toBe("visible");
  });

  it("어느 트랙에도 그 시각을 덮는 클립이 없으면 null을 반환한다", () => {
    const tracks = [{ type: "IMAGE" as const, order: 0, visible: true, clips: [clip("a", 0, 500)] }];
    expect(findClipAtMsByPriority(tracks, ["IMAGE"], 900)).toBeNull();
  });

  it("타입을 여러 개 넘기면 서로 다른 트랙 타입끼리도 order로 경쟁해, 이긴 트랙 타입도 함께 반환한다", () => {
    const tracks = [
      { type: "IMAGE" as const, order: 0, visible: true, clips: [clip("img", 0, 1000)] },
      { type: "VIDEO" as const, order: 1, visible: true, clips: [clip("vid", 0, 1000)] },
    ];
    // 이미지 트랙이 order 0(우선순위 최상단)이라 비디오가 있어도 이미지가 이긴다.
    const result = findClipAtMsByPriority(tracks, ["VIDEO", "IMAGE"], 500);
    expect(result?.clip.id).toBe("img");
    expect(result?.trackType).toBe("IMAGE");
  });

  it("비디오 트랙을 이미지보다 위로 올리면(order를 더 작게) 겹치는 구간에서 비디오가 이긴다", () => {
    const tracks = [
      { type: "VIDEO" as const, order: 0, visible: true, clips: [clip("vid", 0, 1000)] },
      { type: "IMAGE" as const, order: 1, visible: true, clips: [clip("img", 0, 1000)] },
    ];
    const result = findClipAtMsByPriority(tracks, ["VIDEO", "IMAGE"], 500);
    expect(result?.clip.id).toBe("vid");
    expect(result?.trackType).toBe("VIDEO");
  });
});

describe("computeRulerStepSec", () => {
  it("픽셀 간격이 좁을수록(축소 상태) 더 큰 간격을 고른다", () => {
    expect(computeRulerStepSec(6)).toBe(30); // 줌 30%
  });

  it("픽셀 간격이 넓을수록(확대 상태) 더 촘촘한 간격을 고른다", () => {
    expect(computeRulerStepSec(100)).toBe(1); // 줌 500%
  });

  it("줌을 올릴수록(픽셀 간격이 넓어질수록) 간격이 단조 감소한다", () => {
    const pxPerSecValues = [6, 10, 20, 40, 60, 100];
    const steps = pxPerSecValues.map(computeRulerStepSec);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeLessThanOrEqual(steps[i - 1]);
    }
  });

  it("어떤 픽셀 간격에서도 라벨 사이 실제 간격은 최소 기준 이상이다", () => {
    for (const pxPerSec of [1, 3, 6, 10, 20, 40, 100, 500]) {
      const step = computeRulerStepSec(pxPerSec);
      expect(step * pxPerSec).toBeGreaterThanOrEqual(100 * 0.999); // 부동소수점 여유
    }
  });
});
