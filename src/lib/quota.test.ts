import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { DAILY_QUOTA_LIMIT, isQuotaWarning, recordQuotaUsage } from "@/lib/quota";

describe("isQuotaWarning", () => {
  it("80% 미만이면 경고가 아니다", () => {
    expect(isQuotaWarning(7999, 10_000)).toBe(false);
  });

  it("80% 이상이면 경고다", () => {
    expect(isQuotaWarning(8000, 10_000)).toBe(true);
  });

  it("기본 한도(DAILY_QUOTA_LIMIT)를 사용한다", () => {
    expect(isQuotaWarning(DAILY_QUOTA_LIMIT)).toBe(true);
  });
});

describe("recordQuotaUsage", () => {
  const endpoint = "test.endpoint.quota-unit-test";

  afterEach(async () => {
    await prisma.quotaUsage.deleteMany({ where: { endpoint } });
  });

  it("호출별 비용과 오늘 날짜를 기록한다", async () => {
    await recordQuotaUsage(endpoint, 100);
    await recordQuotaUsage(endpoint, 1);

    // getTodayQuotaUsage()는 전체 엔드포인트를 합산하므로(실제 대시보드 용도),
    // 다른 테스트 파일이 병렬로 같은 날짜에 기록하면 경합이 생긴다.
    // 이 테스트는 자신만의 endpoint로 직접 집계해 그 경합을 피한다.
    const today = new Date().toISOString().slice(0, 10);
    const result = await prisma.quotaUsage.aggregate({
      where: { endpoint, date: today },
      _sum: { cost: true },
    });

    expect(result._sum.cost).toBe(101);
  });
});
