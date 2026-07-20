import { describe, expect, it } from "vitest";

import { computePerImageDurationSec, resolveVideoResolution } from "@/lib/video";

describe("resolveVideoResolution", () => {
  it("SHORT는 1080x1920(세로)을 반환한다", () => {
    expect(resolveVideoResolution("SHORT")).toEqual({ width: 1080, height: 1920 });
  });

  it("LONG은 1920x1080(가로)을 반환한다", () => {
    expect(resolveVideoResolution("LONG")).toEqual({ width: 1920, height: 1080 });
  });
});

describe("computePerImageDurationSec", () => {
  it("총 길이를 이미지 수만큼 균등 분배한다", () => {
    expect(computePerImageDurationSec(10_000, 4)).toBe(2.5);
  });

  it("이미지 수가 0 이하이면 에러를 던진다", () => {
    expect(() => computePerImageDurationSec(10_000, 0)).toThrow("1개 이상");
  });
});
