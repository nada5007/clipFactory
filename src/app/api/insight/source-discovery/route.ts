import { NextResponse } from "next/server";

import { discoverSources } from "@/server/services/source-discovery.service";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const concept = params.get("concept")?.trim();
  const region = params.get("region") ?? undefined;
  const excludeKoreanParam = params.get("excludeKorean");

  if (!concept) {
    return NextResponse.json({ error: "컨셉을 입력하세요." }, { status: 400 });
  }

  try {
    const result = await discoverSources({
      concept,
      regionCode: region,
      excludeKorean: excludeKoreanParam === null ? undefined : excludeKoreanParam !== "false",
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "소스 발굴에 실패했습니다." },
      { status: 502 },
    );
  }
}
