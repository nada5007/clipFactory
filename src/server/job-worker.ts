import type { Job } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { generateImages } from "@/server/services/image.service";
import { completeJob, failJob, updateJobProgress } from "@/server/services/job.service";
import { renderVideo } from "@/server/services/video.service";

const POLL_INTERVAL_MS = 1000;

async function runJob(job: Job) {
  const onProgress = async (progress: number, message?: string) => {
    await updateJobProgress(job.id, progress, message);
  };

  try {
    if (job.type === "IMAGES") {
      await generateImages(job.projectId, onProgress);
    } else if (job.type === "RENDER") {
      await renderVideo(job.projectId, onProgress);
    }
    await completeJob(job.id);
  } catch (error) {
    await failJob(job.id, error instanceof Error ? error.message : "작업 실행에 실패했습니다.");
  }
}

async function tick() {
  const job = await prisma.job.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  if (job) {
    await runJob(job);
  }
}

// Next.js Route Handler는 응답을 반환한 뒤 이어지는 fire-and-forget 비동기 작업의 실행을
// 보장하지 않는다 (Next 14는 after()/unstable_after API가 없음). 그래서 이미지 일괄 생성·렌더링
// 같은 장시간 작업은 요청-응답 생명주기와 무관하게 서버 프로세스에 상주하는 이 폴링 워커가 처리한다.
declare global {
  // eslint-disable-next-line no-var
  var __jobWorkerStarted: boolean | undefined;
}

export function startJobWorker() {
  if (globalThis.__jobWorkerStarted) return;
  globalThis.__jobWorkerStarted = true;

  setInterval(() => {
    tick().catch((error) => {
      console.error("[job-worker]", error);
    });
  }, POLL_INTERVAL_MS);
}

startJobWorker();
