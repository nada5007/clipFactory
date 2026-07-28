import fs from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getAudioDurationMs } from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { resolveProjectFilePath } from "@/lib/storage";
import { downloadAudioAsMp3, fetchChannelEntries } from "@/lib/ytdlp";
import {
  deleteBgmTrack,
  getChannelBgmSettings,
  getEffectiveBgmSettings,
  getProjectBgmSettings,
  setChannelBgmSettings,
  setProjectBgmSettings,
  syncBgmLibrary,
  uploadBgmTrack,
} from "@/server/services/bgm.service";

vi.mock("@/lib/ytdlp", () => ({
  fetchChannelEntries: vi.fn(),
  downloadAudioAsMp3: vi.fn(),
}));
vi.mock("@/lib/ffmpeg", () => ({ getAudioDurationMs: vi.fn() }));

// BgmTrack은 프로젝트에 종속되지 않는 전역 라이브러리 테이블이라(실제 dev.db에 진짜 트랙이 쌓여 있을 수
// 있음), 절대 테이블 전체를 지우지 않고 이 테스트가 직접 만든 행만 youtubeId로 골라 하드 삭제한다.
async function cleanupByYoutubeIds(youtubeIds: string[]) {
  await prisma.bgmTrack.deleteMany({ where: { youtubeId: { in: youtubeIds } } });
}

describe("syncBgmLibrary", () => {
  afterEach(() => {
    vi.mocked(fetchChannelEntries).mockReset();
    vi.mocked(downloadAudioAsMp3).mockReset();
  });

  it("신규 항목만 다운로드하고 제목 키워드로 카테고리를 추론한다", async () => {
    const idA = `test-sync-epic-${Date.now()}`;
    const idB = `test-sync-cute-${Date.now()}`;
    vi.mocked(fetchChannelEntries).mockResolvedValue([
      { id: idA, title: "Epic Battle Theme", durationSec: 120 },
      { id: idB, title: "Cute Chit Chat", durationSec: 90 },
    ]);
    vi.mocked(downloadAudioAsMp3).mockResolvedValue(undefined);

    try {
      const count = await syncBgmLibrary(2);
      expect(count).toBe(2);

      const created = await prisma.bgmTrack.findMany({ where: { youtubeId: { in: [idA, idB] } } });
      expect(created.map((t) => t.category).sort()).toEqual(["귀여운", "웅장한"]);
    } finally {
      await cleanupByYoutubeIds([idA, idB]);
    }
  });

  it("이미 있는 youtubeId는 다시 다운로드하지 않는다", async () => {
    const id = `test-sync-repeat-${Date.now()}`;
    vi.mocked(fetchChannelEntries).mockResolvedValue([{ id, title: "Epic", durationSec: 100 }]);
    vi.mocked(downloadAudioAsMp3).mockResolvedValue(undefined);

    try {
      await syncBgmLibrary(1);
      const secondCount = await syncBgmLibrary(1);

      expect(secondCount).toBe(0);
      expect(downloadAudioAsMp3).toHaveBeenCalledTimes(1);
    } finally {
      await cleanupByYoutubeIds([id]);
    }
  });

  it("개별 다운로드 실패는 건너뛰고 나머지는 계속 진행한다", async () => {
    const idFail = `test-sync-fail-${Date.now()}`;
    const idOk = `test-sync-ok-${Date.now()}`;
    vi.mocked(fetchChannelEntries).mockResolvedValue([
      { id: idFail, title: "Fail Track", durationSec: 60 },
      { id: idOk, title: "Calm Lofi", durationSec: 60 },
    ]);
    vi.mocked(downloadAudioAsMp3).mockImplementation(async (_url, outPath) => {
      if (outPath.includes(idFail)) throw new Error("network error");
    });

    try {
      const count = await syncBgmLibrary(2);

      expect(count).toBe(1);
      const created = await prisma.bgmTrack.findMany({ where: { youtubeId: { in: [idFail, idOk] } } });
      expect(created.map((t) => t.youtubeId)).toEqual([idOk]);
    } finally {
      await cleanupByYoutubeIds([idFail, idOk]);
    }
  });
});

describe("uploadBgmTrack / deleteBgmTrack", () => {
  afterEach(() => {
    vi.mocked(getAudioDurationMs).mockReset();
  });

  it("업로드한 파일의 길이를 측정해 저장한다", async () => {
    vi.mocked(getAudioDurationMs).mockResolvedValue(65_000);
    const track = await uploadBgmTrack({ title: "테스트 업로드 BGM", category: "잔잔한", buffer: Buffer.from("fake") });

    try {
      expect(track.durationSec).toBe(65);
      expect(track.source).toBe("upload");
      expect(track.youtubeId).toBeNull();
    } finally {
      await prisma.bgmTrack.delete({ where: { id: track.id } });
      await fs.rm(resolveProjectFilePath("_bgm-library", track.filePath), { force: true });
    }
  });

  it("삭제해도 youtubeId는 남아 재동기화 시 다시 받지 않는다", async () => {
    const id = `test-sync-delete-${Date.now()}`;
    vi.mocked(fetchChannelEntries).mockResolvedValue([{ id, title: "Track", durationSec: 30 }]);
    vi.mocked(downloadAudioAsMp3).mockResolvedValue(undefined);

    try {
      await syncBgmLibrary(1);
      const track = await prisma.bgmTrack.findFirstOrThrow({ where: { youtubeId: id } });

      await deleteBgmTrack(track.id);

      const afterDelete = await prisma.bgmTrack.findUnique({ where: { id: track.id } });
      expect(afterDelete?.isActive).toBe(false);

      const resyncCount = await syncBgmLibrary(1);
      expect(resyncCount).toBe(0);
    } finally {
      await cleanupByYoutubeIds([id]);
    }
  });
});

describe("channel/project BGM 설정 우선순위", () => {
  async function createTestProject() {
    const channel = await prisma.channel.create({ data: { name: "테스트 채널", defaultSettings: {} } });
    const project = await prisma.project.create({
      data: { title: "테스트 프로젝트", channelId: channel.id, videoFormat: "SHORT", settings: {} },
    });
    return { channel, project };
  }
  async function cleanup(projectId: string, channelId: string) {
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.channel.delete({ where: { id: channelId } });
  }

  it("아무 설정도 없으면 scope는 null이다", async () => {
    const { channel, project } = await createTestProject();
    try {
      const effective = await getEffectiveBgmSettings(project.id);
      expect(effective).toEqual({ settings: null, scope: null });
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("채널 기본값만 있으면 채널 설정을 사용한다", async () => {
    const { channel, project } = await createTestProject();
    try {
      await setChannelBgmSettings(channel.id, { trackId: "t1", volumeDb: -3, playbackSpeed: 1, loop: true });
      const effective = await getEffectiveBgmSettings(project.id);
      expect(effective.scope).toBe("channel");
      expect(effective.settings?.trackId).toBe("t1");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("프로젝트 전용 설정이 있으면 채널 기본값보다 우선한다", async () => {
    const { channel, project } = await createTestProject();
    try {
      await setChannelBgmSettings(channel.id, { trackId: "channel-track", volumeDb: 0, playbackSpeed: 1, loop: true });
      await setProjectBgmSettings(project.id, { trackId: "project-track", volumeDb: -6, playbackSpeed: 1.1, loop: false });

      const effective = await getEffectiveBgmSettings(project.id);
      expect(effective.scope).toBe("project");
      expect(effective.settings?.trackId).toBe("project-track");

      const channelSettings = await getChannelBgmSettings(channel.id);
      expect(channelSettings?.trackId).toBe("channel-track");
      const projectSettings = await getProjectBgmSettings(project.id);
      expect(projectSettings?.trackId).toBe("project-track");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});
