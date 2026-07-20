import { prisma } from "@/lib/prisma";

// YouTube Data API 일일 쿼터는 10,000 units (PROJECT_SPEC.md §2.1).
export const DAILY_QUOTA_LIMIT = 10_000;
export const QUOTA_WARNING_RATIO = 0.8;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function recordQuotaUsage(endpoint: string, cost: number): Promise<void> {
  await prisma.quotaUsage.create({
    data: { endpoint, cost, date: todayKey() },
  });
}

export async function getTodayQuotaUsage(): Promise<number> {
  const result = await prisma.quotaUsage.aggregate({
    where: { date: todayKey() },
    _sum: { cost: true },
  });
  return result._sum.cost ?? 0;
}

export function isQuotaWarning(used: number, limit: number = DAILY_QUOTA_LIMIT): boolean {
  return used / limit >= QUOTA_WARNING_RATIO;
}
