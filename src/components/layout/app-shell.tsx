"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";

// UI_SPEC.md §5 "타임라인 편집기": 별도 라우트의 풀스크린 다크 테마 편집기라
// 사이드바/헤더 없이 전체 화면으로 렌더링한다.
const FULLSCREEN_ROUTE_SUFFIX = "/timeline";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isFullscreen = pathname?.endsWith(FULLSCREEN_ROUTE_SUFFIX) ?? false;

  if (isFullscreen) {
    return <div className="h-screen overflow-hidden">{children}</div>;
  }

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
