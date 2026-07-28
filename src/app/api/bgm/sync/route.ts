import { NextResponse } from "next/server";
import { z } from "zod";

import { syncBgmLibrary } from "@/server/services/bgm.service";

const syncSchema = z.object({ maxVideos: z.number().int().min(1).max(50).optional() });

// 프로젝트에 종속되지 않는 전역 동작이라 Job/SSE 대신 동기 처리한다.
// maxVideos를 제한해 응답 시간을 적당히 관리한다 (기본 20개).
export async function POST(request: Request) {
  const rawBody = await request.text();
  const body = syncSchema.safeParse(rawBody ? JSON.parse(rawBody) : {});
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const downloaded = await syncBgmLibrary(body.data.maxVideos);
    return NextResponse.json({ downloaded });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "BGM 동기화에 실패했습니다." },
      { status: 502 },
    );
  }
}
