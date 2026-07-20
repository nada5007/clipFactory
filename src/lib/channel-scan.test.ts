import { describe, expect, it } from "vitest";

import { analyzeChannelVideos, type ScannedVideo } from "@/lib/channel-scan";

function video(overrides: Partial<ScannedVideo>): ScannedVideo {
  return {
    videoId: "v",
    title: "title",
    viewCount: 100,
    publishedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("analyzeChannelVideos", () => {
  it("영상이 없으면 빈 결과를 반환한다", () => {
    const result = analyzeChannelVideos([]);
    expect(result.videoCount).toBe(0);
    expect(result.medianViewCount).toBe(0);
    expect(result.topVideos).toEqual([]);
    expect(result.surgedVideos).toEqual([]);
    expect(result.heatmap).toEqual([]);
  });

  it("중앙값을 산출하고 조회수 상위 10개만 topVideos에 담는다", () => {
    const videos = Array.from({ length: 15 }, (_, i) => video({ videoId: `v${i}`, viewCount: (i + 1) * 100 }));
    const result = analyzeChannelVideos(videos);

    expect(result.videoCount).toBe(15);
    expect(result.medianViewCount).toBe(800);
    expect(result.topVideos).toHaveLength(10);
    expect(result.topVideos[0].viewCount).toBe(1500);
  });

  it("median 대비 3배 이상인 영상만 surgedVideos에 배수 내림차순으로 담는다", () => {
    const videos = [
      video({ videoId: "a", viewCount: 100 }),
      video({ videoId: "b", viewCount: 100 }),
      video({ videoId: "c", viewCount: 100 }),
      video({ videoId: "d", viewCount: 1000 }), // 10x median
      video({ videoId: "e", viewCount: 250 }), // 2.5x median, 미포함
    ];
    const result = analyzeChannelVideos(videos);

    expect(result.medianViewCount).toBe(100);
    expect(result.surgedVideos.map((v) => v.videoId)).toEqual(["d"]);
    expect(result.surgedVideos[0].ratio).toBe(10);
  });

  it("업로드 시각(KST)을 요일×시간대로 집계한 히트맵을 만든다", () => {
    // 2026-01-01 00:00 UTC = 2026-01-01 09:00 KST (목요일)
    const videos = [
      video({ videoId: "a", viewCount: 100, publishedAt: "2026-01-01T00:00:00Z" }),
      video({ videoId: "b", viewCount: 300, publishedAt: "2026-01-01T00:00:00Z" }),
    ];
    const result = analyzeChannelVideos(videos);

    expect(result.heatmap).toHaveLength(1);
    expect(result.heatmap[0]).toMatchObject({ dayOfWeek: 4, hour: 9, videoCount: 2, avgViewCount: 200 });
  });
});
