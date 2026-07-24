import type { DateRangeFilter } from "@/lib/source-discovery-options";

export type ResolvedDateRange = { publishedAfter?: string; publishedBefore?: string };

const DAY_MS = 24 * 60 * 60 * 1000;

// UI_SPEC.md §7.1 "소스 발굴": 5년+/10년+는 하한이 아니라 "그만큼 오래된" 상한(publishedBefore)이다 (고전 영상 발굴 목적).
export function resolveDateRange(filter: DateRangeFilter, now: Date = new Date()): ResolvedDateRange {
  const nowMs = now.getTime();

  switch (filter) {
    case "30D":
      return { publishedAfter: new Date(nowMs - 30 * DAY_MS).toISOString() };
    case "90D":
      return { publishedAfter: new Date(nowMs - 90 * DAY_MS).toISOString() };
    case "1Y":
      return { publishedAfter: new Date(nowMs - 365 * DAY_MS).toISOString() };
    case "3Y":
      return { publishedAfter: new Date(nowMs - 3 * 365 * DAY_MS).toISOString() };
    case "5Y_PLUS":
      return { publishedBefore: new Date(nowMs - 5 * 365 * DAY_MS).toISOString() };
    case "10Y_PLUS":
      return { publishedBefore: new Date(nowMs - 10 * 365 * DAY_MS).toISOString() };
    case "ALL":
    default:
      return {};
  }
}
