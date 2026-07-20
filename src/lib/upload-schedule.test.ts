import { describe, expect, it } from "vitest";

import { isValidScheduleTime } from "@/lib/upload-schedule";

describe("isValidScheduleTime", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  it("15분 미만 여유는 무효로 판정한다", () => {
    expect(isValidScheduleTime(new Date("2026-01-01T00:10:00Z"), now)).toBe(false);
  });

  it("15분 이상 여유는 유효로 판정한다", () => {
    expect(isValidScheduleTime(new Date("2026-01-01T00:15:00Z"), now)).toBe(true);
  });

  it("과거 시각은 무효로 판정한다", () => {
    expect(isValidScheduleTime(new Date("2025-12-31T00:00:00Z"), now)).toBe(false);
  });
});
