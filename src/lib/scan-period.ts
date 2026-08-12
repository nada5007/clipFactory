// PROJECT_SPEC.md §2.5 "채널 분석 — 스캔 기간 드롭다운": 채널 전체 uploads를 다 훑으면 대형 채널에서
// 쿼터·시간이 폭발하므로, 사용자가 최근 N일 창을 골라 그 안의 업로드만 스캔하도록 한다.

export type ScanPeriod = "7d" | "10d" | "20d" | "30d" | "90d" | "180d" | "365d";

export const SCAN_PERIOD_OPTIONS: { value: ScanPeriod; label: string }[] = [
  { value: "7d", label: "최근 7일" },
  { value: "10d", label: "최근 10일" },
  { value: "20d", label: "최근 20일" },
  { value: "30d", label: "최근 한 달" },
  { value: "90d", label: "최근 3개월" },
  { value: "180d", label: "최근 6개월" },
  { value: "365d", label: "최근 1년" },
];

export const SCAN_PERIOD_DEFAULT: ScanPeriod = "10d";

const DAYS_BY_PERIOD: Record<ScanPeriod, number> = {
  "7d": 7,
  "10d": 10,
  "20d": 20,
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
};

// 이 시각(ms) 이전에 올라온 영상은 스캔에서 제외한다.
export function scanPeriodCutoffMs(period: ScanPeriod, now: Date = new Date()): number {
  return now.getTime() - DAYS_BY_PERIOD[period] * 24 * 60 * 60 * 1000;
}

export function scanPeriodLabel(period: ScanPeriod): string {
  return SCAN_PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? period;
}

// 쿼리 파라미터 등 임의 문자열을 유효한 ScanPeriod로 정규화한다(모르면 기본값).
export function parseScanPeriod(value: string | null | undefined): ScanPeriod {
  const found = SCAN_PERIOD_OPTIONS.find((o) => o.value === value);
  return found ? found.value : SCAN_PERIOD_DEFAULT;
}
