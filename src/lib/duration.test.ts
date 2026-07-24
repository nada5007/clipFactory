import { describe, expect, it } from "vitest";

import { formatDurationLabel, parseIso8601DurationSeconds } from "@/lib/duration";

describe("parseIso8601DurationSeconds", () => {
  it("분·초만 있는 경우를 파싱한다", () => {
    expect(parseIso8601DurationSeconds("PT1M30S")).toBe(90);
  });

  it("시간이 포함된 경우를 파싱한다", () => {
    expect(parseIso8601DurationSeconds("PT1H2M3S")).toBe(3723);
  });

  it("초만 있는 경우를 파싱한다", () => {
    expect(parseIso8601DurationSeconds("PT45S")).toBe(45);
  });

  it("잘못된 형식은 0을 반환한다", () => {
    expect(parseIso8601DurationSeconds("invalid")).toBe(0);
  });
});

describe("formatDurationLabel", () => {
  it("1시간 미만은 m:ss로 표시한다", () => {
    expect(formatDurationLabel("PT1M30S")).toBe("1:30");
  });

  it("1시간 이상은 h:mm:ss로 표시한다", () => {
    expect(formatDurationLabel("PT1H2M3S")).toBe("1:02:03");
  });
});
