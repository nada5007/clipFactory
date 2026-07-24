import { NextResponse } from "next/server";

import { generateScriptPatternForVideo } from "@/server/services/video-analysis.service";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title : undefined;
  const description = typeof body?.description === "string" ? body.description : undefined;

  if (!title || !description) {
    return NextResponse.json({ error: "title, description가 필요합니다." }, { status: 400 });
  }

  try {
    const result = await generateScriptPatternForVideo({ title, description });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "대본 패턴을 생성하지 못했습니다." },
      { status: 502 },
    );
  }
}
