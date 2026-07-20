"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { ProjectCard } from "@/components/projects/project-card";
import { ALL, ProjectFilters, type ProjectFiltersValue } from "@/components/projects/project-filters";
import { Button } from "@/components/ui/button";
import type { ProjectListResponse, SerializedChannel } from "@/types/project";

const DEBOUNCE_MS = 300;

function paramsToFilters(params: URLSearchParams): ProjectFiltersValue {
  return {
    q: params.get("q") ?? "",
    channel: params.get("channel") ?? ALL,
    status: params.get("status") ?? ALL,
    format: params.get("format") ?? ALL,
    sort: (params.get("sort") as ProjectFiltersValue["sort"]) ?? "latest",
  };
}

export function ProjectsPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => paramsToFilters(searchParams), [searchParams]);
  const page = Number(searchParams.get("page") ?? "1");

  const [channels, setChannels] = useState<SerializedChannel[]>([]);
  const [data, setData] = useState<ProjectListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(filters.q);

  const applyFilters = useCallback(
    (next: Partial<ProjectFiltersValue>, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { ...filters, ...next };

      for (const [key, value] of Object.entries(merged)) {
        if (!value || value === ALL || (key === "sort" && value === "latest")) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      if (resetPage) params.delete("page");

      router.replace(`${pathname}?${params.toString()}`);
    },
    [filters, pathname, router, searchParams],
  );

  // 검색어는 300ms 디바운스 후 URL에 반영
  useEffect(() => {
    if (searchInput === filters.q) return;
    const timer = setTimeout(() => applyFilters({ q: searchInput }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  useEffect(() => {
    fetch("/api/channels")
      .then((res) => res.json())
      .then(setChannels);
  }, []);

  const fetchProjects = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams(searchParams.toString());
    fetch(`/api/projects?${params.toString()}`)
      .then((res) => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [searchParams]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const goToPage = useCallback(
    (nextPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextPage <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(nextPage));
      }
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">프로젝트 관리</h1>
          <p className="text-sm text-muted-foreground">YouTube 비디오 프로젝트를 생성하고 관리합니다</p>
        </div>
        <CreateProjectDialog channels={channels} onCreated={fetchProjects} />
      </div>

      <ProjectFilters
        value={{ ...filters, q: searchInput }}
        channels={channels}
        onChange={(next) => {
          if ("q" in next) {
            setSearchInput(next.q ?? "");
            return;
          }
          applyFilters(next);
        }}
      />

      {channels.length === 0 && !loading && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          등록된 채널이 없습니다. 먼저 채널 설정에서 채널을 추가해주세요.
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">불러오는 중...</div>
      ) : data && data.items.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((project) => (
            <ProjectCard key={project.id} project={project} onChanged={fetchProjects} />
          ))}
        </div>
      ) : (
        <div className="py-16 text-center text-sm text-muted-foreground">
          조건에 맞는 프로젝트가 없습니다.
        </div>
      )}

      {data && data.total > 0 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
            이전
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
}
