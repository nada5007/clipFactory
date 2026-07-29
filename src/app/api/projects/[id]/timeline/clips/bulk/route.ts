import { NextResponse } from "next/server";
import { z } from "zod";

import { bulkDeleteClips, bulkRestoreClipTimings } from "@/server/services/timeline.service";

// 실행 취소/다시 실행: 클라이언트가 들고 있는 스냅샷으로 여러 클립의 시간을 한 번에 되돌린다.
const bulkSchema = z.object({
  updates: z.array(z.object({ id: z.string().min(1), startMs: z.number().int().min(0), endMs: z.number().int().min(0) })),
});

export async function PUT(request: Request) {
  const body = bulkSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    await bulkRestoreClipTimings(body.data.updates);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "복원에 실패했습니다." },
      { status: 400 },
    );
  }
}

const bulkDeleteSchema = z.object({ ids: z.array(z.string().min(1)).min(1) });

// 멀티 셀렉트 삭제 / 잘라내기(Ctrl+X)에서 사용.
export async function DELETE(request: Request) {
  const body = bulkDeleteSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    await bulkDeleteClips(body.data.ids);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제에 실패했습니다." },
      { status: 400 },
    );
  }
}
