import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateScriptPattern, selectEngagingSegments } from "@/lib/clients/anthropic";
import { buildVideoSegmentClip } from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { downloadVideo, fetchAutoSubtitles } from "@/lib/ytdlp";
import {
  analyzeProjectHighlights,
  buildHighlightVideoTrack,
  generateHighlightAssets,
} from "@/server/services/highlight.service";

vi.mock("@/lib/clients/anthropic", () => ({ selectEngagingSegments: vi.fn(), generateScriptPattern: vi.fn() }));
vi.mock("@/lib/ytdlp", () => ({ fetchAutoSubtitles: vi.fn(), downloadVideo: vi.fn() }));
vi.mock("@/lib/ffmpeg", () => ({ buildVideoSegmentClip: vi.fn() }));

const SAMPLE_VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
흥미로운 도입부

00:00:10.000 --> 00:00:14.000
핵심 반전 구간`;

async function createProject(opts: { withSource: boolean }) {
  const channel = await prisma.channel.create({ data: { name: "테스트 채널", defaultSettings: {} } });
  const project = await prisma.project.create({
    data: {
      title: "하이라이트 테스트",
      channelId: channel.id,
      videoFormat: "SHORT",
      settings: opts.withSource
        ? { sourceVideo: { videoId: "vid123", url: "https://www.youtube.com/watch?v=vid123", title: "원본" } }
        : {},
    },
  });
  return { channel, project };
}

async function cleanup(projectId: string, channelId: string) {
  await prisma.timeline.deleteMany({ where: { projectId } });
  await prisma.uploadedMedia.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.channel.delete({ where: { id: channelId } });
}

describe("analyzeProjectHighlights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(selectEngagingSegments).mockResolvedValue([{ startMs: 1000, endMs: 4000, reason: "후킹" }]);
  });
  afterEach(() => vi.clearAllMocks());

  it("수동 자막이 있으면 자동자막을 받지 않고 그걸로 분석한다", async () => {
    const { channel, project } = await createProject({ withSource: true });
    try {
      const result = await analyzeProjectHighlights(project.id, { manualTranscript: "0:01 도입\n0:10 반전" });

      expect(fetchAutoSubtitles).not.toHaveBeenCalled();
      expect(result.transcriptSource).toBe("manual");
      expect(result.cueCount).toBe(2);
      expect(result.segments).toHaveLength(1);
      // settings에 저장됐는지 확인
      const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect((updated.settings as { highlightSegments?: unknown[] }).highlightSegments).toHaveLength(1);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("수동 자막이 없으면 원본 영상에서 자동자막을 받아 분석한다", async () => {
    vi.mocked(fetchAutoSubtitles).mockResolvedValue(SAMPLE_VTT);
    const { channel, project } = await createProject({ withSource: true });
    try {
      const result = await analyzeProjectHighlights(project.id, {});

      expect(fetchAutoSubtitles).toHaveBeenCalledWith("https://www.youtube.com/watch?v=vid123");
      expect(result.transcriptSource).toBe("auto-subtitle");
      expect(result.cueCount).toBe(2);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("SHORT 기본 목표 길이(45초)를 AI에 전달한다", async () => {
    const { channel, project } = await createProject({ withSource: true });
    try {
      await analyzeProjectHighlights(project.id, { manualTranscript: "0:01 도입" });
      expect(selectEngagingSegments).toHaveBeenCalledWith(expect.any(String), { targetDurationSec: 45, format: "SHORT" });
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("자막을 확보하지 못하면(수동 없음 + 자동자막 null) 안내 에러를 던진다", async () => {
    vi.mocked(fetchAutoSubtitles).mockResolvedValue(null);
    const { channel, project } = await createProject({ withSource: true });
    try {
      await expect(analyzeProjectHighlights(project.id, {})).rejects.toThrow("자막을 확보하지 못했");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("소스 영상이 없고 수동 자막도 없으면 에러를 던진다", async () => {
    const { channel, project } = await createProject({ withSource: false });
    try {
      await expect(analyzeProjectHighlights(project.id, {})).rejects.toThrow("자막을 확보하지 못했");
      expect(fetchAutoSubtitles).not.toHaveBeenCalled();
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});

describe("buildHighlightVideoTrack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(downloadVideo).mockResolvedValue(undefined);
    vi.mocked(buildVideoSegmentClip).mockResolvedValue(undefined);
  });

  async function createProjectWithHighlights(segments: { startMs: number; endMs: number; reason: string }[]) {
    const channel = await prisma.channel.create({ data: { name: "테스트 채널", defaultSettings: {} } });
    const project = await prisma.project.create({
      data: {
        title: "트랙 빌드 테스트",
        channelId: channel.id,
        videoFormat: "SHORT",
        settings: {
          sourceVideo: { videoId: "vid123", url: "https://www.youtube.com/watch?v=vid123", title: "원본" },
          highlightSegments: segments,
        },
      },
    });
    return { channel, project };
  }

  it("구간을 잘라 VIDEO 트랙에 순차 배치하고 타임라인 길이를 확장한다", async () => {
    const { channel, project } = await createProjectWithHighlights([
      { startMs: 8000, endMs: 20000, reason: "후킹" }, // 12s
      { startMs: 35000, endMs: 50000, reason: "반전" }, // 15s
    ]);
    try {
      const result = await buildHighlightVideoTrack(project.id);

      expect(downloadVideo).toHaveBeenCalledWith("https://www.youtube.com/watch?v=vid123", expect.stringContaining("source/original.mp4"));
      expect(buildVideoSegmentClip).toHaveBeenCalledTimes(2);
      // 첫 구간: offset 8s, 길이 12s, SHORT 해상도(1080x1920)
      expect(buildVideoSegmentClip).toHaveBeenCalledWith(expect.any(String), 8, 12, 1080, 1920, expect.any(String));
      expect(result.clipCount).toBe(2);
      expect(result.totalDurationMs).toBe(27000);

      const timeline = await prisma.timeline.findUniqueOrThrow({ where: { projectId: project.id } });
      const videoTrack = await prisma.timelineTrack.findFirstOrThrow({
        where: { timelineId: timeline.id, type: "VIDEO" },
        include: { clips: { orderBy: { startMs: "asc" } } },
      });
      expect(videoTrack.clips).toHaveLength(2);
      expect(videoTrack.clips[0]).toMatchObject({ startMs: 0, endMs: 12000 });
      expect(videoTrack.clips[1]).toMatchObject({ startMs: 12000, endMs: 27000 });
      expect(timeline.durationMs).toBe(27000);

      const updated = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
      expect(updated.status).toBe("EDITING");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("재실행하면 기존 VIDEO 클립을 지우고 다시 배치한다(중복 방지)", async () => {
    const { channel, project } = await createProjectWithHighlights([{ startMs: 0, endMs: 5000, reason: "x" }]);
    try {
      await buildHighlightVideoTrack(project.id);
      await buildHighlightVideoTrack(project.id);

      const timeline = await prisma.timeline.findUniqueOrThrow({ where: { projectId: project.id } });
      const videoTrack = await prisma.timelineTrack.findFirstOrThrow({
        where: { timelineId: timeline.id, type: "VIDEO" },
        include: { clips: true },
      });
      expect(videoTrack.clips).toHaveLength(1); // 중복 누적되지 않음
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("하이라이트 구간이 없으면 안내 에러를 던진다", async () => {
    const { channel, project } = await createProjectWithHighlights([]);
    try {
      await expect(buildHighlightVideoTrack(project.id)).rejects.toThrow("선정된 하이라이트 구간이 없습니다");
      expect(downloadVideo).not.toHaveBeenCalled();
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});

describe("generateHighlightAssets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateScriptPattern).mockResolvedValue({
      title: "재해석 대본 제목",
      hook: "훅",
      body: "본문",
      imagePrompts: ["a", "b"],
    });
  });

  async function createProjectForAssets() {
    const channel = await prisma.channel.create({ data: { name: "테스트 채널", defaultSettings: {} } });
    const project = await prisma.project.create({
      data: {
        title: "에셋 테스트",
        channelId: channel.id,
        videoFormat: "SHORT",
        settings: {
          sourceVideo: { videoId: "v1", url: "https://youtu.be/v1", title: "원본" },
          highlightSegments: [
            { startMs: 8000, endMs: 20000, reason: "A" },
            { startMs: 35000, endMs: 50000, reason: "B" },
          ],
          transcriptCues: [
            { startMs: 8000, endMs: 14000, text: "A자막" },
            { startMs: 36000, endMs: 40000, text: "B자막" },
            { startMs: 60000, endMs: 62000, text: "선택 안 된 구간 자막" },
          ],
        },
      },
    });
    return { channel, project };
  }

  it("자막 큐를 재타이밍해 SUBTITLE 트랙에 만들고 AI 대본을 스크립트로 저장한다", async () => {
    const { channel, project } = await createProjectForAssets();
    try {
      const result = await generateHighlightAssets(project.id);

      // 선택 구간에 겹치는 큐 2개만(선택 안 된 구간 자막 제외)
      expect(result.subtitleCount).toBe(2);
      expect(result.scriptTitle).toBe("재해석 대본 제목");

      const timeline = await prisma.timeline.findUniqueOrThrow({ where: { projectId: project.id } });
      const subtitleTrack = await prisma.timelineTrack.findFirstOrThrow({
        where: { timelineId: timeline.id, type: "SUBTITLE" },
        include: { clips: { orderBy: { startMs: "asc" } } },
      });
      expect(subtitleTrack.clips).toHaveLength(2);
      expect(subtitleTrack.clips[0]).toMatchObject({ startMs: 0, endMs: 6000 }); // 8~14 → 0~6

      const script = await prisma.script.findUniqueOrThrow({ where: { projectId: project.id } });
      expect(script.title).toBe("재해석 대본 제목");
    } finally {
      await prisma.timeline.deleteMany({ where: { projectId: project.id } });
      await prisma.script.deleteMany({ where: { projectId: project.id } });
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.channel.delete({ where: { id: channel.id } });
    }
  });

  it("선정 구간이 없으면 에러", async () => {
    const channel = await prisma.channel.create({ data: { name: "c", defaultSettings: {} } });
    const project = await prisma.project.create({
      data: { title: "x", channelId: channel.id, videoFormat: "SHORT", settings: {} },
    });
    try {
      await expect(generateHighlightAssets(project.id)).rejects.toThrow("선정된 하이라이트 구간이 없습니다");
      expect(generateScriptPattern).not.toHaveBeenCalled();
    } finally {
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.channel.delete({ where: { id: channel.id } });
    }
  });
});
