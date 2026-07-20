import { NextResponse } from "next/server";

import { listImages } from "@/server/services/image.service";
import { createJob } from "@/server/services/job.service";
import "@/server/job-worker";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const images = await listImages(params.id);
  return NextResponse.json(images);
}

// 이미지 일괄 생성은 장시간 작업이므로 작업 레코드만 만들고 즉시 응답한다.
// 실제 실행은 job-worker의 백그라운드 폴링 루프가 담당하고,
// 진행률은 GET /api/projects/:id/events?type=IMAGES로 SSE 스트리밍한다.
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const job = await createJob(params.id, "IMAGES");
  return NextResponse.json({ jobId: job.id }, { status: 202 });
}
