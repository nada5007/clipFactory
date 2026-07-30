import { NextResponse } from "next/server";
import { z } from "zod";

import { restoreClipsSnapshot } from "@/server/services/timeline.service";

// 실행 취소(Ctrl+Z)/다시 실행(Ctrl+Y): 클라이언트가 들고 있는 "그 시점 전체 클립 목록" 스냅샷으로 되돌린다.
// payload는 클립 타입별로 모양이 달라 여기서는 느슨하게(내부 왕복 데이터이므로) 검증한다.
const clipSchema = z.object({
  id: z.string().min(1),
  trackId: z.string().min(1),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  zIndex: z.number().int().optional(),
  payload: z.record(z.string(), z.unknown()),
});
const bodySchema = z.object({ clips: z.array(clipSchema) });

export async function PUT(request: Request) {
  const body = bodySchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    await restoreClipsSnapshot(body.data.clips as Parameters<typeof restoreClipsSnapshot>[0]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "복원에 실패했습니다." },
      { status: 400 },
    );
  }
}
