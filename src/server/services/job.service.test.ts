import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import {
  completeJob,
  createJob,
  failJob,
  getLatestJob,
  updateJobProgress,
} from "@/server/services/job.service";

async function createTestProject() {
  const channel = await prisma.channel.create({ data: { name: "테스트 채널", defaultSettings: {} } });
  const project = await prisma.project.create({
    data: { title: "테스트 프로젝트", channelId: channel.id, videoFormat: "SHORT", settings: {} },
  });
  return { channel, project };
}

async function cleanup(projectId: string, channelId: string) {
  await prisma.job.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.channel.delete({ where: { id: channelId } });
}

describe("job.service", () => {
  it("생성한 작업은 PENDING 상태이고 최신 작업으로 조회된다", async () => {
    const { channel, project } = await createTestProject();
    try {
      const job = await createJob(project.id, "IMAGES");
      expect(job.status).toBe("PENDING");
      expect(job.progress).toBe(0);

      const latest = await getLatestJob(project.id, "IMAGES");
      expect(latest?.id).toBe(job.id);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("진행률 갱신 시 RUNNING으로 전환된다", async () => {
    const { channel, project } = await createTestProject();
    try {
      const job = await createJob(project.id, "IMAGES");
      const updated = await updateJobProgress(job.id, 50, "진행 중");

      expect(updated.status).toBe("RUNNING");
      expect(updated.progress).toBe(50);
      expect(updated.message).toBe("진행 중");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("완료 시 SUCCEEDED와 progress 100으로 전환된다", async () => {
    const { channel, project } = await createTestProject();
    try {
      const job = await createJob(project.id, "RENDER");
      const done = await completeJob(job.id);

      expect(done.status).toBe("SUCCEEDED");
      expect(done.progress).toBe(100);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("실패 시 FAILED와 에러 메시지가 기록된다", async () => {
    const { channel, project } = await createTestProject();
    try {
      const job = await createJob(project.id, "RENDER");
      const failed = await failJob(job.id, "ffmpeg 실패");

      expect(failed.status).toBe("FAILED");
      expect(failed.error).toBe("ffmpeg 실패");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("getLatestJob은 가장 최근에 생성된 작업을 반환한다", async () => {
    const { channel, project } = await createTestProject();
    try {
      const first = await createJob(project.id, "IMAGES");
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await createJob(project.id, "IMAGES");

      const latest = await getLatestJob(project.id, "IMAGES");
      expect(latest?.id).toBe(second.id);
      expect(latest?.id).not.toBe(first.id);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});
