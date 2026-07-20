import type { JobType } from "@prisma/client";
import { NextResponse } from "next/server";

import { getLatestJob } from "@/server/services/job.service";

export const dynamic = "force-dynamic";

const JOB_TYPES: JobType[] = ["IMAGES", "RENDER"];
const POLL_INTERVAL_MS = 500;

// 프로젝트의 장시간 작업(이미지 일괄 생성/렌더링) 진행률을 SSE로 스트리밍한다.
// ?type=IMAGES|RENDER 로 어떤 작업을 구독할지 지정한다.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const type = new URL(request.url).searchParams.get("type") as JobType | null;
  if (!type || !JOB_TYPES.includes(type)) {
    return NextResponse.json({ error: "type 쿼리 파라미터가 필요합니다 (IMAGES | RENDER)." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      while (!closed) {
        const job = await getLatestJob(params.id, type);
        if (job) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(job)}\n\n`));
          if (job.status === "SUCCEEDED" || job.status === "FAILED") {
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      if (!closed) controller.close();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
