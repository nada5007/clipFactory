// UI_SPEC.md §4.6 "예약 업로드 사용": YouTube는 과거 시각의 publishAt을 거부하므로 최소 여유시간을 둔다.
const MIN_LEAD_TIME_MS = 15 * 60 * 1000;

export function isValidScheduleTime(target: Date, now: Date = new Date()): boolean {
  return target.getTime() - now.getTime() >= MIN_LEAD_TIME_MS;
}
