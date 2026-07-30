import { NextResponse } from "next/server";
import { z } from "zod";

import { bulkDeleteClips } from "@/server/services/timeline.service";

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
