import { describe, expect, it } from "vitest";

import { parseChannelInput } from "@/lib/channel-input";

describe("parseChannelInput", () => {
  it("24자 UC로 시작하는 채널 ID를 그대로 인식한다", () => {
    const id = "UC" + "a".repeat(22);
    expect(parseChannelInput(id)).toEqual({ type: "id", value: id });
  });

  it("channel URL에서 채널 ID를 추출한다", () => {
    const id = "UC" + "b".repeat(22);
    expect(parseChannelInput(`https://www.youtube.com/channel/${id}`)).toEqual({ type: "id", value: id });
  });

  it("핸들 URL에서 @handle을 추출한다", () => {
    expect(parseChannelInput("https://www.youtube.com/@veritasium")).toEqual({
      type: "handle",
      value: "@veritasium",
    });
  });

  it("@로 시작하는 입력은 handle로 인식한다", () => {
    expect(parseChannelInput("@veritasium")).toEqual({ type: "handle", value: "@veritasium" });
  });

  it("그 외 입력은 검색어(query)로 취급한다", () => {
    expect(parseChannelInput("먹방 채널")).toEqual({ type: "query", value: "먹방 채널" });
  });

  it("앞뒤 공백을 제거한다", () => {
    expect(parseChannelInput("  @veritasium  ")).toEqual({ type: "handle", value: "@veritasium" });
  });
});
