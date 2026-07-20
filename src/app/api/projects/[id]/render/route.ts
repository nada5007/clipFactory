import { NextResponse } from "next/server";

import { createJob } from "@/server/services/job.service";
import { getVideo } from "@/server/services/video.service";
import "@/server/job-worker";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const video = await getVideo(params.id);
  if (!video) {
    return NextResponse.json({ error: "렌더링된 영상이 없습니다." }, { status: 404 });
  }
  return NextResponse.json(video);
}

// 렌더링은 장시간 작업이므로 작업 레코드만 만들고 즉시 응답한다.
// 실제 실행은 job-worker의 백그라운드 폴링 루프가 담당하고,
// 진행률은 GET /api/projects/:id/events?type=RENDER로 SSE 스트리밍한다.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const job = await createJob(params.id, "RENDER");
  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
