import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { extractAudioTrack, getAudioDurationMs } from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { uploadMedia, uploadMediaToTrack } from "@/server/services/media.service";
import { getOrSyncTimeline } from "@/server/services/timeline.service";

vi.mock("@/lib/ffmpeg", () => ({
  getAudioDurationMs: vi.fn().mockResolvedValue(2000),
  extractAudioTrack: vi.fn().mockResolvedValue(true),
}));

async function createProject() {
  const channel = await prisma.channel.create({ data: { name: "테스트 채널", defaultSettings: {} } });
  const project = await prisma.project.create({
    data: { title: "테스트 프로젝트", channelId: channel.id, videoFormat: "SHORT", settings: {} },
  });
  return { channel, project };
}

// getOrSyncTimeline이 durationMs > 0인 타임라인을 만들도록 최소 세그먼트 하나를 붙인다
// (빈 프로젝트는 durationMs=0이라 addUploadedMediaClip이 "공간 없음"으로 실패한다).
async function createProjectWithTimelineSpace() {
  const { channel, project } = await createProject();
  await prisma.audioSegment.create({
    data: {
      projectId: project.id,
      order: 0,
      text: "placeholder",
      startMs: 0,
      endMs: 5000,
      filePath: "audio/0.mp3",
      provider: "elevenlabs",
      voiceId: "voice-x",
      model: "eleven_multilingual_v2",
    },
  });
  return { channel, project };
}

async function cleanup(projectId: string, channelId: string) {
  await prisma.uploadedMedia.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.channel.delete({ where: { id: channelId } });
  await fs.rm(path.join(process.cwd(), "storage", projectId), { recursive: true, force: true });
}

describe("uploadMedia", () => {
  let cleanupQueue: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const fn of cleanupQueue) await fn();
    cleanupQueue = [];
  });

  it("이미지 파일을 저장하고 UploadedMedia 레코드를 만든다(길이는 null)", async () => {
    const { channel, project } = await createProject();
    cleanupQueue.push(() => cleanup(project.id, channel.id));

    const media = await uploadMedia(project.id, "image", { buffer: Buffer.from([1, 2, 3]), mimeType: "image/png" });

    expect(media.kind).toBe("image");
    expect(media.durationMs).toBeNull();
    expect(media.filePath).toMatch(/^uploads\/image_.*\.png$/);

    const written = await fs.readFile(path.join(process.cwd(), "storage", project.id, media.filePath));
    expect(written).toEqual(Buffer.from([1, 2, 3]));
  });

  it("허용하지 않는 MIME 타입은 거부한다", async () => {
    const { channel, project } = await createProject();
    cleanupQueue.push(() => cleanup(project.id, channel.id));

    await expect(
      uploadMedia(project.id, "image", { buffer: Buffer.from([1]), mimeType: "application/pdf" }),
    ).rejects.toThrow("지원하지 않는 파일 형식");
  });

  it("용량 제한을 초과하면 거부한다", async () => {
    const { channel, project } = await createProject();
    cleanupQueue.push(() => cleanup(project.id, channel.id));

    const oversized = Buffer.alloc(11 * 1024 * 1024); // 이미지 제한 10MB 초과
    await expect(uploadMedia(project.id, "image", { buffer: oversized, mimeType: "image/png" })).rejects.toThrow(
      "너무 큽니다",
    );
  });
});

describe("uploadMediaToTrack — 비디오 업로드 시 오디오 자동 추출", () => {
  let cleanupQueue: (() => Promise<void>)[] = [];

  afterEach(async () => {
    for (const fn of cleanupQueue) await fn();
    cleanupQueue = [];
    vi.mocked(extractAudioTrack).mockResolvedValue(true);
    vi.mocked(getAudioDurationMs).mockResolvedValue(2000);
  });

  it("VIDEO 트랙에 업로드하면 비디오 클립과 함께 AUDIO(비디오 오디오) 트랙에도 클립이 자동으로 생긴다", async () => {
    const { channel, project } = await createProjectWithTimelineSpace();
    cleanupQueue.push(() => cleanup(project.id, channel.id));

    const timeline = await getOrSyncTimeline(project.id);
    const videoTrack = timeline!.tracks.find((t) => t.type === "VIDEO")!;
    const audioTrack = timeline!.tracks.find((t) => t.type === "AUDIO")!;
    expect(audioTrack.clips).toHaveLength(0);

    await uploadMediaToTrack(project.id, videoTrack.id, 0, {
      buffer: Buffer.from([1, 2, 3]),
      mimeType: "video/mp4",
      name: "clip.mp4",
    });

    const updatedAudioTrack = await prisma.timelineTrack.findUniqueOrThrow({
      where: { id: audioTrack.id },
      include: { clips: true },
    });
    expect(updatedAudioTrack.clips).toHaveLength(1);
    expect((updatedAudioTrack.clips[0].payload as { label?: string }).label).toBe("비디오 오디오");
  });

  it("오디오 스트림이 없는(추출 실패) 영상이면 비디오 업로드는 성공하고 오디오 클립만 생략된다", async () => {
    vi.mocked(extractAudioTrack).mockResolvedValueOnce(false);
    const { channel, project } = await createProjectWithTimelineSpace();
    cleanupQueue.push(() => cleanup(project.id, channel.id));

    const timeline = await getOrSyncTimeline(project.id);
    const videoTrack = timeline!.tracks.find((t) => t.type === "VIDEO")!;
    const audioTrack = timeline!.tracks.find((t) => t.type === "AUDIO")!;

    const clip = await uploadMediaToTrack(project.id, videoTrack.id, 0, {
      buffer: Buffer.from([1, 2, 3]),
      mimeType: "video/mp4",
      name: "silent.mp4",
    });
    expect(clip.trackId).toBe(videoTrack.id);

    const updatedAudioTrack = await prisma.timelineTrack.findUniqueOrThrow({
      where: { id: audioTrack.id },
      include: { clips: true },
    });
    expect(updatedAudioTrack.clips).toHaveLength(0);
  });
});
