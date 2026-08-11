import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { selectEngagingSegments } from "@/lib/clients/anthropic";
import { prisma } from "@/lib/prisma";
import { fetchAutoSubtitles } from "@/lib/ytdlp";
import { analyzeProjectHighlights } from "@/server/services/highlight.service";

vi.mock("@/lib/clients/anthropic", () => ({ selectEngagingSegments: vi.fn() }));
vi.mock("@/lib/ytdlp", () => ({ fetchAutoSubtitles: vi.fn() }));

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
