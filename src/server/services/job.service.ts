import type { JobType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type JobProgressReporter = (progress: number, message?: string) => void | Promise<void>;

export function createJob(projectId: string, type: JobType, payload?: Prisma.InputJsonValue) {
  return prisma.job.create({ data: { projectId, type, payload } });
}

// tick()이 PENDING 작업을 찾아 실행을 시작하기 전, 이 함수로 원자적으로 "선점"한다.
// 폴링 간격(1초)마다 setInterval 콜백이 이전 tick()의 완료를 기다리지 않고 겹쳐 실행될 수 있는데,
// generateImages/renderVideo는 첫 onProgress 호출 전까지 status가 여전히 PENDING이라
// 이 선점 없이는 같은 작업이 동시에 두 번 실행되어(예: ImageAsset의 projectId+order 유니크 제약 위반) 충돌한다.
export async function claimPendingJob(jobId: string): Promise<boolean> {
  const result = await prisma.job.updateMany({
    where: { id: jobId, status: "PENDING" },
    data: { status: "RUNNING" },
  });
  return result.count > 0;
}

export function updateJobProgress(jobId: string, progress: number, message?: string) {
  return prisma.job.update({
    where: { id: jobId },
    data: { status: "RUNNING", progress, message },
  });
}

export function completeJob(jobId: string) {
  return prisma.job.update({
    where: { id: jobId },
    data: { status: "SUCCEEDED", progress: 100 },
  });
}

export function failJob(jobId: string, error: string) {
  return prisma.job.update({
    where: { id: jobId },
    data: { status: "FAILED", error },
  });
}

export function getLatestJob(projectId: string, type: JobType) {
  return prisma.job.findFirst({
    where: { projectId, type },
    orderBy: { createdAt: "desc" },
  });
}
