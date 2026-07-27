// UI_SPEC.md §7.1 "떡상 영상" 스크린샷 확정 폼 옵션.

export type SurgePeriod = "1h" | "6h" | "12h" | "24h" | "7d" | "30d" | "90d" | "1y" | "all";

export const SURGE_PERIOD_OPTIONS: { value: SurgePeriod; label: string }[] = [
  { value: "1h", label: "최근 1시간" },
  { value: "6h", label: "최근 6시간" },
  { value: "12h", label: "최근 12시간" },
  { value: "24h", label: "최근 24시간" },
  { value: "7d", label: "최근 7일" },
  { value: "30d", label: "최근 30일" },
  { value: "90d", label: "최근 90일" },
  { value: "1y", label: "최근 1년" },
  { value: "all", label: "전체 기간" },
];

export function surgePeriodToPublishedAfter(period: SurgePeriod, now: Date = new Date()): string | undefined {
  const hoursByPeriod: Record<Exclude<SurgePeriod, "all">, number> = {
    "1h": 1,
    "6h": 6,
    "12h": 12,
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
    "90d": 24 * 90,
    "1y": 24 * 365,
  };
  if (period === "all") return undefined;
  return new Date(now.getTime() - hoursByPeriod[period] * 60 * 60 * 1000).toISOString();
}

// UI_SPEC.md §7.1: threshold(배수) 4단계. 2배가 "추천 기본값".
export const SURGE_THRESHOLD_OPTIONS = [
  { value: 1.5, label: "평균 1.5배 이상 (느슨)" },
  { value: 2, label: "평균 2배 이상 (기본)" },
  { value: 3, label: "평균 3배 이상 (확실)" },
  { value: 5, label: "평균 5배 이상 (바이럴)" },
];

export const SURGE_DEFAULT_THRESHOLD = 2;

// UI_SPEC.md §7.1 "💎 숨겨진 보석 모드": 구독자 상한 5단계, 10만이 기본값.
export const SUBSCRIBER_CAP_OPTIONS = [
  { value: 10_000, label: "구독자 1만↓" },
  { value: 50_000, label: "구독자 5만↓" },
  { value: 100_000, label: "구독자 10만↓" },
  { value: 500_000, label: "구독자 50만↓" },
  { value: 1_000_000, label: "구독자 100만↓" },
];

export const SUBSCRIBER_CAP_DEFAULT = 100_000;

// "신생 강자" 배지 기준 (숨겨진 보석 모드 여부와 무관하게 결과에 표시).
export const RISING_STAR_SUBSCRIBER_THRESHOLD = 10_000;
