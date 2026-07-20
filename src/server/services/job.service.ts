import type { JobType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type JobProgressReporter = (progress: number, message?: string) => void | Promise<void>;

export function createJob(projectId: string, type: JobType) {
  return prisma.job.create({ data: { projectId, type } });
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
