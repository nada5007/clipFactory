import type { ReactNode } from "react";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

// 사이드바/헤더는 어느 화면(타임라인 편집기 포함)에서도 항상 보인다 — 전체 화면으로 채워야 할 대상은
// 타임라인 편집기 내부의 미리보기 영상 표시 영역뿐이며, 그건 그 컴포넌트 안에서 처리한다.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto bg-background p-6">{children}</main>
      </div>
    </div>
  );
}
