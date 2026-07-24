// PROJECT_SPEC.md §2.3 "소스 발굴 (2.2) — UI 확장 요구사항" / UI_SPEC.md §7.1 "소스 발굴" 기준 폼 옵션.

export type RegionOption = { code: string; label: string };
export type RegionGroup = { group: string; regions: RegionOption[] };

export const REGION_GROUPS: RegionGroup[] = [
  {
    group: "영어권",
    regions: [
      { code: "US", label: "미국" },
      { code: "GB", label: "영국" },
      { code: "CA", label: "캐나다" },
      { code: "AU", label: "호주" },
      { code: "NZ", label: "뉴질랜드" },
      { code: "IE", label: "아일랜드" },
      { code: "SG", label: "싱가포르" },
      { code: "IN", label: "인도" },
    ],
  },
  {
    group: "서유럽",
    regions: [
      { code: "DE", label: "독일" },
      { code: "FR", label: "프랑스" },
      { code: "NL", label: "네덜란드" },
      { code: "BE", label: "벨기에" },
      { code: "AT", label: "오스트리아" },
      { code: "CH", label: "스위스" },
      { code: "IT", label: "이탈리아" },
      { code: "ES", label: "스페인" },
      { code: "PT", label: "포르투갈" },
    ],
  },
  {
    group: "북유럽",
    regions: [
      { code: "SE", label: "스웨덴" },
      { code: "NO", label: "노르웨이" },
      { code: "DK", label: "덴마크" },
      { code: "FI", label: "핀란드" },
      { code: "IS", label: "아이슬란드" },
    ],
  },
  {
    group: "동유럽",
    regions: [
      { code: "PL", label: "폴란드" },
      { code: "CZ", label: "체코" },
      { code: "HU", label: "헝가리" },
      { code: "RO", label: "루마니아" },
      { code: "GR", label: "그리스" },
      { code: "UA", label: "우크라이나" },
      { code: "RU", label: "러시아" },
      { code: "TR", label: "튀르키예" },
    ],
  },
  {
    group: "아시아",
    regions: [
      { code: "JP", label: "일본" },
      { code: "TW", label: "대만" },
      { code: "HK", label: "홍콩" },
      { code: "ID", label: "인도네시아" },
      { code: "TH", label: "태국" },
      { code: "VN", label: "베트남" },
      { code: "MY", label: "말레이시아" },
      { code: "PH", label: "필리핀" },
    ],
  },
  {
    group: "라틴아메리카",
    regions: [
      { code: "BR", label: "브라질" },
      { code: "MX", label: "멕시코" },
      { code: "AR", label: "아르헨티나" },
      { code: "CO", label: "콜롬비아" },
      { code: "CL", label: "칠레" },
    ],
  },
  {
    group: "중동·아프리카",
    regions: [
      { code: "AE", label: "UAE" },
      { code: "SA", label: "사우디" },
      { code: "EG", label: "이집트" },
      { code: "IL", label: "이스라엘" },
      { code: "ZA", label: "남아공" },
    ],
  },
];

export const ALL_REGION_CODES: string[] = REGION_GROUPS.flatMap((g) => g.regions.map((r) => r.code));

export type LanguageOption = { code: string; label: string };

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: "en", label: "영어" },
  { code: "ja", label: "일본어" },
  { code: "zh", label: "중국어" },
  { code: "es", label: "스페인어" },
  { code: "de", label: "독일어" },
  { code: "fr", label: "프랑스어" },
  { code: "it", label: "이탈리아어" },
  { code: "pt", label: "포르투갈어" },
  { code: "ru", label: "러시아어" },
  { code: "pl", label: "폴란드어" },
  { code: "tr", label: "튀르키예어" },
  { code: "id", label: "인도네시아어" },
  { code: "th", label: "태국어" },
  { code: "vi", label: "베트남어" },
  { code: "ar", label: "아랍어" },
];

export type LengthFilter = "ALL" | "SHORT" | "MEDIUM_LONG" | "LONG";

export const LENGTH_OPTIONS: { value: LengthFilter; label: string }[] = [
  { value: "ALL", label: "전체 (기본)" },
  { value: "SHORT", label: "쇼츠 ≤3분" },
  { value: "MEDIUM_LONG", label: "롱폼 짧은 4~20분" },
  { value: "LONG", label: "롱폼 긴 20분+" },
];

export type DateRangeFilter = "ALL" | "30D" | "90D" | "1Y" | "3Y" | "5Y_PLUS" | "10Y_PLUS";

export const DATE_RANGE_OPTIONS: { value: DateRangeFilter; label: string }[] = [
  { value: "ALL", label: "ALL (기본 — 전체 기간)" },
  { value: "30D", label: "최근 30일" },
  { value: "90D", label: "최근 90일" },
  { value: "1Y", label: "최근 1년" },
  { value: "3Y", label: "최근 3년" },
  { value: "5Y_PLUS", label: "5년+ (고전 영상)" },
  { value: "10Y_PLUS", label: "10년+ (고전 영상)" },
];

export type MinViewFilter = 0 | 10000 | 100000 | 1000000;

export const MIN_VIEW_OPTIONS: { value: MinViewFilter; label: string }[] = [
  { value: 0, label: "제한 없음 (기본)" },
  { value: 10000, label: "1만+" },
  { value: 100000, label: "10만+" },
  { value: 1000000, label: "100만+" },
];

export type SortOption = "MATCH" | "VIEWS" | "LATEST" | "SHORTS_FIT";

// 기본값(MATCH)은 매칭 점수 내림차순, 동점 시 조회수로 2차 정렬한다 (스크린샷 기본 표시 문구 그대로 사용).
export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "MATCH", label: "조회수 (매칭도 우선, 기본)" },
  { value: "VIEWS", label: "조회수순" },
  { value: "LATEST", label: "최신순" },
  { value: "SHORTS_FIT", label: "쇼츠 적합도" },
];
