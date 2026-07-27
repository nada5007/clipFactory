import { describe, expect, it } from "vitest";

import { detectSurgedVideos, type ChannelBaseline, type SurgeCandidateVideo } from "@/lib/surge-detection";

function video(overrides: Partial<SurgeCandidateVideo>): SurgeCandidateVideo {
  return {
    videoId: "v1",
    title: "제목",
    channelId: "c1",
    channelTitle: "채널",
    viewCount: 10_000,
    publishedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function baseline(overrides: Partial<ChannelBaseline>): ChannelBaseline {
  return { channelId: "c1", medianViewCount: 1_000, sampleSize: 10, ...overrides };
}

describe("detectSurgedVideos", () => {
  it("threshold 이상인 영상만 배수 내림차순으로 반환한다", () => {
    const videos = [
      video({ videoId: "a", channelId: "c1", viewCount: 10_000 }), // 10x
      video({ videoId: "b", channelId: "c1", viewCount: 3_000 }), // 3x, threshold 미만
    ];
    const baselines = [baseline({ channelId: "c1" })];

    const result = detectSurgedVideos(videos, baselines, 5);

    expect(result.map((v) => v.videoId)).toEqual(["a"]);
    expect(result[0].ratio).toBe(10);
  });

  it("채널 표본이 5개 미만이면 제외한다", () => {
    const videos = [video({ viewCount: 100_000 })];
    const baselines = [baseline({ sampleSize: 4 })];

    expect(detectSurgedVideos(videos, baselines, 5)).toEqual([]);
  });

  it("조회수 1000 미만은 노이즈로 제외한다", () => {
    const videos = [video({ viewCount: 500 })];
    const baselines = [baseline({ medianViewCount: 10 })];

    expect(detectSurgedVideos(videos, baselines, 5)).toEqual([]);
  });

  it("median 대비 50배 초과는 outlier로 차단한다", () => {
    const videos = [video({ viewCount: 100_000 })];
    const baselines = [baseline({ medianViewCount: 1_000 })]; // 100x

    expect(detectSurgedVideos(videos, baselines, 5)).toEqual([]);
  });

  it("baseline이 없는 채널의 영상은 제외한다", () => {
    const videos = [video({ channelId: "unknown" })];
    const baselines = [baseline({ channelId: "c1" })];

    expect(detectSurgedVideos(videos, baselines, 5)).toEqual([]);
  });

  it("구독자 1만 미만 채널의 영상에는 신생 강자 배지를 붙인다", () => {
    const videos = [video({ viewCount: 10_000 })];
    const baselines = [baseline({ subscriberCount: 5_000 })];

    const result = detectSurgedVideos(videos, baselines, 5);
    expect(result[0].isRisingStar).toBe(true);
  });

  it("구독자 1만 이상 채널은 신생 강자가 아니다", () => {
    const videos = [video({ viewCount: 10_000 })];
    const baselines = [baseline({ subscriberCount: 50_000 })];

    const result = detectSurgedVideos(videos, baselines, 5);
    expect(result[0].isRisingStar).toBe(false);
  });

  it("숨겨진 보석 모드: 구독자 상한을 초과한 채널의 영상은 제외한다", () => {
    const videos = [video({ viewCount: 10_000 })];
    const baselines = [baseline({ subscriberCount: 200_000 })];

    const result = detectSurgedVideos(videos, baselines, 5, { enabled: true, subscriberCap: 100_000 });
    expect(result).toEqual([]);
  });

  it("숨겨진 보석 모드: 구독자 비공개 채널의 영상은 제외한다", () => {
    const videos = [video({ viewCount: 10_000 })];
    const baselines = [baseline({ subscriberCount: 100, hiddenSubscriberCount: true })];

    const result = detectSurgedVideos(videos, baselines, 5, { enabled: true, subscriberCap: 100_000 });
    expect(result).toEqual([]);
  });

  it("숨겨진 보석 모드가 꺼져 있으면 구독자 상한을 무시한다", () => {
    const videos = [video({ viewCount: 10_000 })];
    const baselines = [baseline({ subscriberCount: 999_999_999 })];

    const result = detectSurgedVideos(videos, baselines, 5);
    expect(result).toHaveLength(1);
  });
});
