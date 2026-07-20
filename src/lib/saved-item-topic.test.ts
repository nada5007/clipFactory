import { describe, expect, it } from "vitest";

import { composeTopicFromSavedItem } from "@/lib/saved-item-topic";

const TOPIC_MIN = 100;
const TOPIC_MAX = 2000;

describe("composeTopicFromSavedItem", () => {
  it("VIDEO 스냅샷에서 100~2000자 topic을 생성한다", () => {
    const topic = composeTopicFromSavedItem({
      type: "VIDEO",
      snapshot: { videoId: "v1", title: "떡상한 영상", channelTitle: "작은 채널", viewCount: 500000, ratio: 12.3 },
    });

    expect(topic.length).toBeGreaterThanOrEqual(TOPIC_MIN);
    expect(topic.length).toBeLessThanOrEqual(TOPIC_MAX);
    expect(topic).toContain("떡상한 영상");
    expect(topic).toContain("12.3배");
  });

  it("CHANNEL 스냅샷에서 채널 지표를 포함한 topic을 생성한다", () => {
    const topic = composeTopicFromSavedItem({
      type: "CHANNEL",
      snapshot: { channelId: "c1", title: "벤치마크 채널", subscriberCount: 10000, videoCount: 50, viewCount: 1000000 },
    });

    expect(topic.length).toBeGreaterThanOrEqual(TOPIC_MIN);
    expect(topic).toContain("벤치마크 채널");
  });

  it("IDEA 스냅샷에서 훅·차별화·키워드를 포함한 topic을 생성한다", () => {
    const topic = composeTopicFromSavedItem({
      type: "IDEA",
      snapshot: {
        title: "AI 아이디어 제목",
        hook: "이거 실화냐?",
        differentiator: "실제 데이터로 검증",
        keywords: ["키워드1", "키워드2"],
        sourceVideoTitle: "원본 영상",
      },
    });

    expect(topic).toContain("이거 실화냐?");
    expect(topic).toContain("실제 데이터로 검증");
    expect(topic).toContain("키워드1, 키워드2");
    expect(topic).toContain("원본 영상");
  });
});
