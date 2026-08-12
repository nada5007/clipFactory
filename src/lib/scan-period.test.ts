import { describe, expect, it } from "vitest";

import { parseScanPeriod, scanPeriodCutoffMs, scanPeriodLabel, SCAN_PERIOD_DEFAULT } from "@/lib/scan-period";

describe("scan-period", () => {
  it("기본값은 10일이다", () => {
    expect(SCAN_PERIOD_DEFAULT).toBe("10d");
  });

  it("컷오프는 기간(일)만큼 과거 시각을 반환하고 all은 null이다", () => {
    const now = new Date("2026-08-12T00:00:00Z");
    expect(scanPeriodCutoffMs("7d", now)).toBe(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(scanPeriodCutoffMs("30d", now)).toBe(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    expect(scanPeriodCutoffMs("all", now)).toBeNull();
  });

  it("parseScanPeriod는 유효값만 통과시키고 나머지는 기본값으로 정규화한다", () => {
    expect(parseScanPeriod("90d")).toBe("90d");
    expect(parseScanPeriod("all")).toBe("all");
    expect(parseScanPeriod("nonsense")).toBe(SCAN_PERIOD_DEFAULT);
    expect(parseScanPeriod(null)).toBe(SCAN_PERIOD_DEFAULT);
  });

  it("라벨을 한국어로 돌려준다", () => {
    expect(scanPeriodLabel("10d")).toBe("최근 10일");
    expect(scanPeriodLabel("all")).toBe("전체 기간");
  });
});
