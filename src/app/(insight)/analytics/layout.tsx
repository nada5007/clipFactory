import { InsightTabBar } from "@/components/insight/insight-tab-bar";

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">유튜브 데이터 분석</h1>
        <p className="text-sm text-muted-foreground">
          키워드 탐색, 경쟁 채널 분석, SEO 최적화, 자동화 등 채널 성장 종합 도구
        </p>
      </div>
      <InsightTabBar />
      <div>{children}</div>
    </div>
  );
}
