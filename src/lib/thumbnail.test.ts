import { describe, expect, it } from "vitest";

import { resolveThumbnailResolution } from "@/lib/thumbnail";

describe("resolveThumbnailResolution", () => {
  it("SHORT는 1080x1920 세로 해상도를 반환한다", () => {
    expect(resolveThumbnailResolution("SHORT")).toEqual({ width: 1080, height: 1920 });
  });

  it("LONG은 1280x720 표준 해상도를 반환한다", () => {
    expect(resolveThumbnailResolution("LONG")).toEqual({ width: 1280, height: 720 });
  });
});
