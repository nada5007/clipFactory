"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isActivePath } from "@/lib/nav";
import {
  BOTTOM_NAV,
  MAIN_NAV,
  isNavGroup,
  type NavEntry,
  type NavLink,
} from "@/components/layout/nav-items";

function NavLinkItem({
  item,
  active,
  collapsed,
}: {
  item: NavLink;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  // 접힘 상태에서는 라벨이 숨겨지므로, 참조 사이트(reelbox.ai)처럼 아이콘 우측에 다크 툴팁으로 메뉴명을 띄운다.
  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function NavSection({
  entries,
  pathname,
  collapsed,
}: {
  entries: NavEntry[];
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {entries.map((entry) => {
        if (!isNavGroup(entry)) {
          return (
            <NavLinkItem
              key={entry.href}
              item={entry}
              active={isActivePath(pathname, entry.href)}
              collapsed={collapsed}
            />
          );
        }

        const GroupIcon = entry.icon;
        const groupActive = entry.children.some((child) =>
          isActivePath(pathname, child.href),
        );

        if (collapsed) {
          return (
            <div key={entry.label} className="flex flex-col gap-1">
              {entry.children.map((child) => (
                <NavLinkItem
                  key={child.href}
                  item={child}
                  active={isActivePath(pathname, child.href)}
                  collapsed={collapsed}
                />
              ))}
            </div>
          );
        }

        return (
          <Accordion
            key={entry.label}
            type="single"
            collapsible
            defaultValue={groupActive ? entry.label : undefined}
          >
            <AccordionItem value={entry.label} className="border-none">
              <AccordionTrigger
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground hover:no-underline",
                  groupActive && "text-accent-foreground",
                )}
              >
                <span className="flex items-center gap-3">
                  <GroupIcon className="size-4 shrink-0" />
                  {entry.label}
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-0 pl-4">
                <div className="flex flex-col gap-1 pt-1">
                  {entry.children.map((child) => (
                    <NavLinkItem
                      key={child.href}
                      item={child}
                      active={isActivePath(pathname, child.href)}
                      collapsed={false}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <TooltipProvider delayDuration={200}>
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r bg-card transition-[width] duration-200",
        collapsed ? "w-16" : "w-[280px]",
      )}
    >
      <div className={cn("flex h-16 items-center border-b px-3", collapsed ? "justify-center" : "justify-end")}>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-between overflow-y-auto p-3">
        <NavSection entries={MAIN_NAV} pathname={pathname} collapsed={collapsed} />

        <div className="flex flex-col gap-3">
          <Separator />
          <NavSection entries={BOTTOM_NAV} pathname={pathname} collapsed={collapsed} />
          <Separator />

          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2",
              collapsed && "justify-center px-0",
            )}
          >
            <div className="relative shrink-0">
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary text-primary-foreground">U</AvatarFallback>
              </Avatar>
              <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card bg-green-500" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">사용자</p>
                <p className="truncate text-xs text-muted-foreground">user@example.com</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
    </TooltipProvider>
  );
}
