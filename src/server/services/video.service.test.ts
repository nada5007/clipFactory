import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildImageSegmentClip,
  buildVideoSegmentClip,
  burnSubtitles,
  concatAudioFiles,
  concatVideoSegments,
  generateSilence,
  mixAudioTracks,
  muxVideoAudio,
  prepareBgmAudio,
  trimOrPadAudioToDuration,
} from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { renderVideo } from "@/server/services/video.service";

vi.mock("@/lib/ffmpeg", () => ({
  concatAudioFiles: vi.fn().mockResolvedValue(undefined),
  buildImageSegmentClip: vi.fn().mockResolvedValue(undefined),
  buildVideoSegmentClip: vi.fn().mockResolvedValue(undefined),
  concatVideoSegments: vi.fn().mockResolvedValue(undefined),
  prepareBgmAudio: vi.fn().mockResolvedValue(undefined),
  mixAudioTracks: vi.fn().mockResolvedValue(undefined),
  muxVideoAudio: vi.fn().mockResolvedValue(undefined),
  generateSilence: vi.fn().mockResolvedValue(undefined),
  trimOrPadAudioToDuration: vi.fn().mockResolvedValue(undefined),
  burnSubtitles: vi.fn().mockResolvedValue(undefined),
}));

async function createProjectWithAssets(options: { audio: boolean; images: boolean }) {
  const channel = await prisma.channel.create({ data: { name: "테스트 채널", defaultSettings: {} } });
  const project = await prisma.project.create({
    data: { title: "테스트 프로젝트", channelId: channel.id, videoFormat: "SHORT", settings: {} },
  });

  if (options.audio) {
    await prisma.audioSegment.createMany({
      data: [
        {
          projectId: project.id,
          order: 0,
          text: "첫 문장",
          startMs: 0,
          endMs: 1000,
          filePath: "audio/0.mp3",
          provider: "elevenlabs",
          voiceId: "v1",
          model: "m1",
        },
        {
          projectId: project.id,
          order: 1,
          text: "둘째 문장",
          startMs: 1000,
          endMs: 2500,
          filePath: "audio/1.mp3",
          provider: "elevenlabs",
          voiceId: "v1",
          model: "m1",
        },
      ],
    });
  }

  if (options.images) {
    await prisma.imageAsset.createMany({
      data: [
        {
          projectId: project.id,
          order: 0,
          prompt: "a cat",
          filePath: "images/0.png",
          model: "gpt-image-1",
          size: "1024x1536",
        },
      ],
    });
  }

  return { channel, project };
}

async function cleanup(projectId: string, channelId: string) {
  await prisma.timeline.deleteMany({ where: { projectId } });
  await prisma.videoAsset.deleteMany({ where: { projectId } });
  await prisma.uploadedMedia.deleteMany({ where: { projectId } });
  await prisma.imageAsset.deleteMany({ where: { projectId } });
  await prisma.audioSegment.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.channel.delete({ where: { id: channelId } });
  await fs.rm(path.join(process.cwd(), "storage", projectId), { recursive: true, force: true });
}

describe("renderVideo", () => {
  afterEach(() => {
    vi.mocked(concatAudioFiles).mockClear();
    vi.mocked(buildImageSegmentClip).mockClear();
    vi.mocked(buildVideoSegmentClip).mockClear();
    vi.mocked(concatVideoSegments).mockClear();
    vi.mocked(prepareBgmAudio).mockClear();
    vi.mocked(mixAudioTracks).mockClear();
    vi.mocked(muxVideoAudio).mockClear();
    vi.mocked(generateSilence).mockClear();
    vi.mocked(trimOrPadAudioToDuration).mockClear();
    vi.mocked(burnSubtitles).mockClear();
  });

  it("성공 시 VideoAsset을 생성하고 Project.status/progress를 갱신한다", async () => {
    const { channel, project } = await createProjectWithAssets({ audio: true, images: true });
    try {
      const video = await renderVideo(project.id);

      expect(video.durationMs).toBe(2500);
      expect(video.width).toBe(1080);
      expect(video.height).toBe(1920);
      expect(video.filePath).toBe("video.mp4");
      expect(video.subtitlePath).toBe("subtitles.srt");

      // 두 TTS 세그먼트가 빈틈없이 이어져 있어(0~1000, 1000~2500) 트림/무음 없이 그대로 이어붙는다.
      expect(concatAudioFiles).toHaveBeenCalledTimes(1);
      expect(generateSilence).not.toHaveBeenCalled();
      expect(trimOrPadAudioToDuration).not.toHaveBeenCalled();
      // 이미지 하나뿐이라 세그먼트 1개(정지 이미지 클립)만 만들어져 이어붙여진다.
      expect(buildImageSegmentClip).toHaveBeenCalledTimes(1);
      expect(buildVideoSegmentClip).not.toHaveBeenCalled();
      expect(concatVideoSegments).toHaveBeenCalledTimes(1);
      // BGM 설정이 없는 프로젝트라 믹싱은 건너뛴다.
      expect(prepareBgmAudio).not.toHaveBeenCalled();
      expect(mixAudioTracks).not.toHaveBeenCalled();
      expect(muxVideoAudio).toHaveBeenCalledTimes(1);
      expect(burnSubtitles).toHaveBeenCalledTimes(1);

      const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(updated.status).toBe("RENDERED");
      expect(updated.progress).toBe(80);

      const srt = await fs.readFile(
        path.join(process.cwd(), "storage", project.id, "subtitles.srt"),
        "utf-8",
      );
      expect(srt).toContain("첫 문장");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("단계별로 onProgress 콜백을 호출한다", async () => {
    const { channel, project } = await createProjectWithAssets({ audio: true, images: true });
    try {
      const onProgress = vi.fn();

      await renderVideo(project.id, onProgress);

      expect(onProgress).toHaveBeenCalledWith(5, expect.any(String));
      expect(onProgress).toHaveBeenCalledWith(20, expect.any(String));
      expect(onProgress).toHaveBeenCalledWith(45, expect.any(String));
      expect(onProgress).toHaveBeenCalledWith(70, expect.any(String));
      expect(onProgress).toHaveBeenCalledWith(90, expect.any(String));
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("TTS 음성이 없으면 에러를 던진다", async () => {
    const { channel, project } = await createProjectWithAssets({ audio: false, images: true });
    try {
      await expect(renderVideo(project.id)).rejects.toThrow("TTS 음성이 없어");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("이미지도 비디오도 없으면 에러를 던진다", async () => {
    const { channel, project } = await createProjectWithAssets({ audio: true, images: false });
    try {
      await expect(renderVideo(project.id)).rejects.toThrow("이미지나 비디오가 없어");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("렌더링 실패 시 Project.status를 FAILED로 바꾼다", async () => {
    const { channel, project } = await createProjectWithAssets({ audio: true, images: true });
    try {
      vi.mocked(muxVideoAudio).mockRejectedValueOnce(new Error("ffmpeg 실패"));

      await expect(renderVideo(project.id)).rejects.toThrow("ffmpeg 실패");

      const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(updated.status).toBe("FAILED");
      expect(updated.errorMessage).toBe("ffmpeg 실패");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("트림으로 클립 사이에 빈 구간이 생기면 무음을 삽입한다", async () => {
    const { channel, project } = await createProjectWithAssets({ audio: true, images: true });
    try {
      // 최초 진입으로 Timeline 자동 생성 후, 두 번째 TTS 클립을 뒤로 트림해 빈 구간을 만든다.
      await renderVideo(project.id).catch(() => undefined); // Timeline 생성 목적, 실패해도 무방
      vi.mocked(concatAudioFiles).mockClear();
      vi.mocked(muxVideoAudio).mockClear();
      vi.mocked(buildImageSegmentClip).mockClear();
      vi.mocked(burnSubtitles).mockClear();

      const timeline = await prisma.timeline.findUniqueOrThrow({ where: { projectId: project.id } });
      const ttsTrack = await prisma.timelineTrack.findFirstOrThrow({
        where: { timelineId: timeline.id, type: "TTS" },
        include: { clips: { orderBy: { startMs: "asc" } } },
      });
      const secondClip = ttsTrack.clips[1];
      await prisma.timelineClip.update({
        where: { id: secondClip.id },
        data: { startMs: 1500 }, // 1000~1500 사이에 빈 구간 발생 (원본 세그먼트 endMs=2500 그대로 유지)
      });

      await renderVideo(project.id);

      expect(generateSilence).toHaveBeenCalledTimes(1);
      expect(generateSilence).toHaveBeenCalledWith(0.5, expect.any(String));
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("VIDEO 트랙이 IMAGE보다 우선순위가 높으면 겹치는 구간에서 비디오 세그먼트를 만든다", async () => {
    const { channel, project } = await createProjectWithAssets({ audio: true, images: true });
    try {
      await renderVideo(project.id).catch(() => undefined); // Timeline 생성 목적

      const timeline = await prisma.timeline.findUniqueOrThrow({ where: { projectId: project.id } });
      const videoTrack = await prisma.timelineTrack.findFirstOrThrow({
        where: { timelineId: timeline.id, type: "VIDEO" },
      });
      const media = await prisma.uploadedMedia.create({
        data: { projectId: project.id, kind: "video", filePath: "uploads/clip.mp4", durationMs: 1500 },
      });
      await prisma.timelineClip.create({
        data: {
          trackId: videoTrack.id,
          startMs: 500,
          endMs: 1500,
          zIndex: 0,
          payload: { label: "clip.mp4", mediaId: media.id, mediaKind: "video" },
        },
      });

      vi.mocked(buildImageSegmentClip).mockClear();
      vi.mocked(buildVideoSegmentClip).mockClear();

      await renderVideo(project.id);

      // 이미지(0~2500) 전체를 비디오(500~1500)가 order 우선순위로 가운데를 덮어, 앞/뒤 이미지
      // 세그먼트 2개 + 가운데 비디오 세그먼트 1개, 총 3개 세그먼트가 만들어진다.
      expect(buildImageSegmentClip).toHaveBeenCalledTimes(2);
      expect(buildVideoSegmentClip).toHaveBeenCalledTimes(1);
      expect(buildVideoSegmentClip).toHaveBeenCalledWith(
        expect.stringContaining("clip.mp4"),
        0,
        1,
        1080,
        1920,
        expect.any(String),
        undefined,
        false, // 이미지도 있어 원본 오디오 모드 아님 → keepAudio=false
      );
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("원본 오디오 모드: TTS 없이 VIDEO 클립만 있으면 클립 오디오를 유지해 렌더한다", async () => {
    const { channel, project } = await createProjectWithAssets({ audio: false, images: false });
    try {
      await renderVideo(project.id).catch(() => undefined); // 타임라인 생성 목적(자산 없어 실패해도 무방)

      const timeline = await prisma.timeline.findUniqueOrThrow({ where: { projectId: project.id } });
      const videoTrack = await prisma.timelineTrack.findFirstOrThrow({
        where: { timelineId: timeline.id, type: "VIDEO" },
      });
      const media = await prisma.uploadedMedia.create({
        data: { projectId: project.id, kind: "video", filePath: "uploads/hl.mp4", durationMs: 2000 },
      });
      await prisma.timelineClip.create({
        data: { trackId: videoTrack.id, startMs: 0, endMs: 2000, zIndex: 0, payload: { label: "hl", mediaId: media.id, mediaKind: "video" } },
      });
      await prisma.timeline.update({ where: { id: timeline.id }, data: { durationMs: 2000 } });

      vi.mocked(buildVideoSegmentClip).mockClear();
      vi.mocked(muxVideoAudio).mockClear();
      vi.mocked(concatAudioFiles).mockClear();

      const video = await renderVideo(project.id);

      // 원본 오디오 모드: 비디오 세그먼트를 keepAudio=true로 만들고, TTS 오디오 합성/뮤싱은 하지 않는다.
      expect(buildVideoSegmentClip).toHaveBeenCalledWith(
        expect.stringContaining("hl.mp4"),
        0,
        2,
        1080,
        1920,
        expect.any(String), // 출력 경로
        undefined, // colorFilter 없음
        true, // keepAudio (원본 오디오 유지)
      );
      expect(concatAudioFiles).not.toHaveBeenCalled();
      expect(muxVideoAudio).not.toHaveBeenCalled();
      expect(burnSubtitles).toHaveBeenCalledTimes(1);
      expect(video.durationMs).toBe(2000);

      const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(updated.status).toBe("RENDERED");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("프로젝트에 유효 BGM 설정이 있으면 BGM을 준비해 TTS 음성과 믹싱한다", async () => {
    const { channel, project } = await createProjectWithAssets({ audio: true, images: true });
    try {
      const bgmTrack = await prisma.bgmTrack.create({
        data: { title: "테스트 BGM", category: "calm", filePath: "bgm_1.mp3", source: "upload" },
      });
      await prisma.project.update({
        where: { id: project.id },
        data: { settings: { bgm: { trackId: bgmTrack.id, volumeDb: -6, playbackSpeed: 1, loop: true } } },
      });

      await renderVideo(project.id);

      expect(prepareBgmAudio).toHaveBeenCalledTimes(1);
      expect(prepareBgmAudio).toHaveBeenCalledWith(
        expect.stringContaining("bgm_1.mp3"),
        { volumeLinear: expect.closeTo(0.501, 2), playbackSpeed: 1, loop: true },
        2.5,
        expect.any(String),
      );
      expect(mixAudioTracks).toHaveBeenCalledTimes(1);
    } finally {
      await prisma.bgmTrack.deleteMany({ where: { title: "테스트 BGM" } });
      await cleanup(project.id, channel.id);
    }
  });
});
