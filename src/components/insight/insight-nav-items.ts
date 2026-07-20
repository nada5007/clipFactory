export type InsightTab = { label: string; href: string };

// UI_SPEC.md §7.0 탭 바 10개
export const INSIGHT_TABS: InsightTab[] = [
  { label: "홈", href: "/analytics" },
  { label: "소스 발굴", href: "/analytics/source" },
  { label: "쇼핑 소스 발굴", href: "/analytics/shopping" },
  { label: "탐색·분석", href: "/analytics/explore" },
  { label: "채널 분석", href: "/analytics/channel" },
  { label: "한·영 비교", href: "/analytics/compare" },
  { label: "제목 변경 이력", href: "/analytics/title-history" },
  { label: "영상 SEO", href: "/analytics/seo" },
  { label: "떡상 영상", href: "/analytics/trending" },
  { label: "저장됨", href: "/analytics/saved" },
];
