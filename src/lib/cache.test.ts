import { afterEach, describe, expect, it, vi } from "vitest";

import { cached } from "@/lib/cache";
import { prisma } from "@/lib/prisma";

const TEST_KEY = "test:cache:key";

describe("cached", () => {
  afterEach(async () => {
    await prisma.apiCache.deleteMany({ where: { cacheKey: { startsWith: "test:cache:" } } });
  });

  it("캐시 미스면 fetcher를 호출하고 결과를 저장한다", async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 1 });

    const result = await cached(TEST_KEY, 60, fetcher);

    expect(result).toEqual({ value: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("캐시 히트면 fetcher를 다시 호출하지 않는다", async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 2 });

    await cached(TEST_KEY, 60, fetcher);
    const second = await cached(TEST_KEY, 60, fetcher);

    expect(second).toEqual({ value: 2 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("만료된 캐시는 fetcher를 다시 호출한다", async () => {
    const fetcher = vi.fn().mockResolvedValue({ value: 3 });

    // 이미 만료된 캐시 항목을 직접 심어둔다.
    await prisma.apiCache.create({
      data: { cacheKey: TEST_KEY, payload: { value: 0 }, expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await cached(TEST_KEY, 60, fetcher);

    expect(result).toEqual({ value: 3 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
