import { findExploreCategory, type PerformanceTier } from "@/lib/explore-options";

const MIN_ELAPSED_HOURS = 1; // 게시 직후(0시간)로 인한 0 나눗셈 방지

export function computeVph(viewCount: number, publishedAt: string, now: Date = new Date()): number {
  const elapsedHours = Math.max(MIN_ELAPSED_HOURS, (now.getTime() - new Date(publishedAt).getTime()) / (1000 * 60 * 60));
  return viewCount / elapsedHours;
}

// UI_SPEC.md §7.1: "성능 등급 = VPH·경과일·조회수 조합 규칙" (원 서비스 자체 산출, 정확한 임계값은 비공개).
// 재현 임계값: 최근성이 높을수록 + 시간당 조회수가 높을수록 상위 등급.
export function computePerformanceTier(
  viewCount: number,
  publishedAt: string,
  now: Date = new Date(),
): PerformanceTier {
  const vph = computeVph(viewCount, publishedAt, now);
  const ageDays = Math.max(0, (now.getTime() - new Date(publishedAt).getTime()) / (1000 * 60 * 60 * 24));

  if (ageDays <= 3 && vph >= 500) return "explosive";
  if (ageDays <= 7 && vph >= 100) return "rising";
  if (ageDays <= 30 && vph >= 20) return "steady_growth";
  if (ageDays > 30 && vph >= 5) return "evergreen";
  return "stagnant";
}

// UI_SPEC.md §7.1: "추정 수익 = 조회수 × 카테고리별 RPM 추정치". 자체 산출 참고용 수치.
export function computeEstimatedRevenueKrw(viewCount: number, categoryId: string): number {
  const category = findExploreCategory(categoryId);
  return Math.round((viewCount / 1000) * category.rpmPer1000Views);
}

export function formatVphLabel(vph: number): string {
  if (vph >= 10000) return `시간당 ${(vph / 10000).toFixed(1)}만회`;
  return `시간당 ${Math.round(vph).toLocaleString("ko-KR")}회`;
}

export function formatRevenueLabel(krw: number): string {
  if (krw >= 10000) return `추정 약 ${(krw / 10000).toFixed(1)}만원`;
  return `추정 약 ${krw.toLocaleString("ko-KR")}원`;
}
