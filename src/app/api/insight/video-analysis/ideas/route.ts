import { NextResponse } from "next/server";

import { generateIdeasForVideo } from "@/server/services/video-analysis.service";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title : undefined;
  const description = typeof body?.description === "string" ? body.description : undefined;
  const commentSummary = typeof body?.commentSummary === "string" ? body.commentSummary : undefined;

  if (!title || !description) {
    return NextResponse.json({ error: "title, description가 필요합니다." }, { status: 400 });
  }

  try {
    const result = await generateIdeasForVideo({ title, description, commentSummary });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "아이디어를 생성하지 못했습니다." },
      { status: 502 },
    );
  }
}
