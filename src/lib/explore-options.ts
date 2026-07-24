// UI_SPEC.md §7.1 "탐색·분석": browse 모드 폼 옵션 + 카테고리별 평균 수익(자체 산출, 화면 표기용) 참조 테이블.

export type ExplorePeriod = "1h" | "6h" | "24h" | "7d" | "30d";

export const PERIOD_OPTIONS: { value: ExplorePeriod; label: string }[] = [
  { value: "1h", label: "최근 1시간" },
  { value: "6h", label: "최근 6시간" },
  { value: "24h", label: "최근 24시간" },
  { value: "7d", label: "최근 7일" },
  { value: "30d", label: "최근 30일" },
];

export function periodToHours(period: ExplorePeriod): number {
  switch (period) {
    case "1h":
      return 1;
    case "6h":
      return 6;
    case "24h":
      return 24;
    case "7d":
      return 24 * 7;
    case "30d":
      return 24 * 30;
  }
}

export type VideoForm = "all" | "short" | "long";

export const VIDEO_FORM_OPTIONS: { value: VideoForm; label: string }[] = [
  { value: "all", label: "전체 (쇼츠+롱폼)" },
  { value: "short", label: "쇼츠 (180초 이하)" },
  { value: "long", label: "롱폼 (180초 초과)" },
];

const SHORTS_MAX_DURATION_SECONDS = 180;

// UI_SPEC.md §7.1: "쇼츠 = 180초 이하 + #shorts / 롱폼 = 180초 초과 또는 시그널 없음".
// #shorts 여부는 API로 신뢰성 있게 판별하기 어려워 길이(180초)를 1차 판별 기준으로 사용한다.
export function classifyVideoForm(durationSeconds: number): "short" | "long" {
  return durationSeconds <= SHORTS_MAX_DURATION_SECONDS ? "short" : "long";
}

export type MinViewFilter = "all" | "1000" | "10000" | "100000" | "1000000";

export const MIN_VIEW_OPTIONS: { value: MinViewFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "1000", label: "1천+" },
  { value: "10000", label: "1만+ ★" },
  { value: "100000", label: "10만+" },
  { value: "1000000", label: "100만+" },
];

export function minViewFilterToCount(filter: MinViewFilter): number {
  return filter === "all" ? 0 : Number(filter);
}

export type PerformanceTier = "explosive" | "rising" | "steady_growth" | "evergreen" | "stagnant";

export const PERFORMANCE_TIER_LABELS: Record<PerformanceTier, string> = {
  explosive: "폭발적",
  rising: "상승세",
  steady_growth: "안정 성장",
  evergreen: "장기 영상",
  stagnant: "정체",
};

export const PERFORMANCE_TIER_ORDER: PerformanceTier[] = [
  "explosive",
  "rising",
  "steady_growth",
  "evergreen",
  "stagnant",
];

// UI_SPEC.md §7.1: 카테고리 드롭다운에 "평균 수익" 병기 + 결과 카드의 "추정 수익" 산출에 재사용하는 참조 테이블.
// ⚠️ ReelBox(참조 서비스)가 자체 산출한 수치를 재현한 것으로 YouTube 공식 데이터가 아니다.
// avgRevenueLabel: 카테고리 드롭다운에 그대로 표시하는 참고용 문구(화면 확정 수치를 그대로 사용).
// rpmPer1000Views: 개별 영상 카드의 "추정 수익" = 조회수/1000 * rpmPer1000Views (원, 자체 추정치).
export type ExploreCategory = {
  id: string;
  label: string;
  avgRevenueLabel?: string;
  rpmPer1000Views: number;
};

export const EXPLORE_CATEGORIES: ExploreCategory[] = [
  { id: "ALL", label: "전체 카테고리", rpmPer1000Views: 200 },
  { id: "10", label: "음악", avgRevenueLabel: "평균 ₩2.0M", rpmPer1000Views: 260 },
  { id: "20", label: "게임", avgRevenueLabel: "평균 ₩491K", rpmPer1000Views: 150 },
  { id: "22", label: "인물·블로그", avgRevenueLabel: "평균 ₩104K", rpmPer1000Views: 120 },
  { id: "24", label: "엔터테인먼트", avgRevenueLabel: "평균 ₩1.7M", rpmPer1000Views: 200 },
  { id: "25", label: "뉴스·정치", avgRevenueLabel: "평균 ₩519K", rpmPer1000Views: 180 },
  { id: "26", label: "노하우·스타일", avgRevenueLabel: "평균 ₩830K", rpmPer1000Views: 240 },
  { id: "27", label: "교육", rpmPer1000Views: 200 },
  { id: "28", label: "과학·기술", avgRevenueLabel: "평균 ₩192K", rpmPer1000Views: 160 },
];

export function findExploreCategory(id: string): ExploreCategory {
  return EXPLORE_CATEGORIES.find((c) => c.id === id) ?? EXPLORE_CATEGORIES[0];
}

export const REGION_OPTIONS = [
  { value: "KR", label: "대한민국" },
  { value: "US", label: "미국" },
  { value: "JP", label: "일본" },
  { value: "GB", label: "영국" },
];

export type SortOption = "views" | "recommend";

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "views", label: "조회수순" },
  { value: "recommend", label: "성능 등급순" },
];
