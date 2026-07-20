import {
  BarChart3,
  BookOpen,
  CalendarClock,
  CreditCard,
  FileText,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  Lightbulb,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavLink = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label: string;
  icon: LucideIcon;
  children: NavLink[];
};

export type NavEntry = NavLink | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "children" in entry;
}

// 대시보드는 앱 루트("/")에 매핑한다.
export const MAIN_NAV: NavEntry[] = [
  { label: "대시보드", href: "/", icon: LayoutDashboard },
  { label: "프로젝트 관리", href: "/projects", icon: FolderKanban },
  { label: "스케줄 관리", href: "/schedule", icon: CalendarClock },
  { label: "아이디어 뱅크", href: "/idea-bank", icon: Lightbulb },
  {
    label: "성과 분석",
    icon: BarChart3,
    children: [
      { label: "YouTube 분석", href: "/performance/youtube", icon: BarChart3 },
      { label: "파트너스 수익", href: "/performance/partners", icon: CreditCard },
      { label: "유튜브 데이터 분석", href: "/analytics", icon: BarChart3 },
    ],
  },
];

export const BOTTOM_NAV: NavEntry[] = [
  { label: "채널 설정", href: "/channels", icon: Settings },
  { label: "API 키 설정", href: "/settings/api-keys", icon: KeyRound },
  { label: "구독 관리", href: "/billing", icon: CreditCard },
  { label: "이용 약관", href: "/terms", icon: FileText },
  {
    label: "이용 가이드",
    icon: BookOpen,
    children: [
      { label: "가이드 페이지", href: "/guide", icon: BookOpen },
      { label: "AI 어시스턴트", href: "/guide/ai-assistant", icon: Lightbulb },
    ],
  },
];
