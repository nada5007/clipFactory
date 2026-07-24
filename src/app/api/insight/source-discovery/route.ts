import { NextResponse } from "next/server";

import type { DateRangeFilter, LengthFilter, MinViewFilter, SortOption } from "@/lib/source-discovery-options";
import { discoverSources } from "@/server/services/source-discovery.service";

function parseListParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const concept = params.get("concept")?.trim();

  if (!concept) {
    return NextResponse.json({ error: "컨셉을 입력하세요." }, { status: 400 });
  }

  const excludeKoreanParam = params.get("excludeKorean");
  const minViewCountParam = params.get("minViewCount");

  try {
    const result = await discoverSources({
      concept,
      regionCodes: parseListParam(params.get("regions")),
      languages: parseListParam(params.get("languages")),
      excludeKorean: excludeKoreanParam === null ? undefined : excludeKoreanParam !== "false",
      length: (params.get("length") as LengthFilter | null) ?? undefined,
      dateRange: (params.get("dateRange") as DateRangeFilter | null) ?? undefined,
      minViewCount: minViewCountParam ? (Number(minViewCountParam) as MinViewFilter) : undefined,
      sort: (params.get("sort") as SortOption | null) ?? undefined,
      translateTitles: params.get("translateTitles") === "true",
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "소스 발굴에 실패했습니다." },
      { status: 502 },
    );
  }
}
