"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { INSIGHT_TABS } from "@/components/insight/insight-nav-items";
import { cn } from "@/lib/utils";

export function InsightTabBar() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 overflow-x-auto border-b">
      {INSIGHT_TABS.map((tab) => {
        const active = tab.href === "/analytics" ? pathname === "/analytics" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
