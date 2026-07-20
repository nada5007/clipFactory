import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// 외부 API 응답을 TTL 동안 DB에 캐싱한다. 캐시 히트 시 fetcher는 호출되지 않는다
// (쿼터 소비를 피하기 위해 lib/quota.ts 기록도 fetcher 내부에서만 이뤄지도록 한다).
export async function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const entry = await prisma.apiCache.findUnique({ where: { cacheKey: key } });

  if (entry && entry.expiresAt > new Date()) {
    return entry.payload as T;
  }

  const payload = await fetcher();

  await prisma.apiCache.upsert({
    where: { cacheKey: key },
    create: {
      cacheKey: key,
      payload: payload as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    },
    update: {
      payload: payload as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    },
  });

  return payload;
}
