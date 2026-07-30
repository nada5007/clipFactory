import { describe, expect, it } from "vitest";

import type { PersistedClipPayload } from "@/lib/timeline";
import { prisma } from "@/lib/prisma";
import {
  addTtsBreathingGaps,
  applySubtitleLineLengthFix,
  bulkDeleteClips,
  deleteClip,
  duplicateClip,
  getOrSyncTimeline,
  pasteClips,
  removeGapsBetweenClips,
  removeTrackGaps,
  reorderTrack,
  restoreClipsSnapshot,
  scaleTrackToTargetDuration,
  splitClip,
  syncTimeline,
  updateAudioOptions,
  updateClipText,
  updateClipTiming,
  updateTrackFlags,
} from "@/server/services/timeline.service";

async function createTestProject(input: {
  segments: { order: number; text: string; startMs: number; endMs: number }[];
  images: { order: number }[];
}) {
  const channel = await prisma.channel.create({ data: { name: "테스트 채널", defaultSettings: {} } });
  const project = await prisma.project.create({
    data: { title: "테스트 프로젝트", channelId: channel.id, videoFormat: "SHORT", settings: {} },
  });

  for (const s of input.segments) {
    await prisma.audioSegment.create({
      data: {
        projectId: project.id,
        order: s.order,
        text: s.text,
        startMs: s.startMs,
        endMs: s.endMs,
        filePath: `audio/${s.order}.mp3`,
        provider: "elevenlabs",
        voiceId: "voice-x",
        model: "eleven_multilingual_v2",
      },
    });
  }
  for (const i of input.images) {
    await prisma.imageAsset.create({
      data: {
        projectId: project.id,
        order: i.order,
        prompt: `scene ${i.order}`,
        filePath: `images/${i.order}.png`,
        model: "gpt-image-1",
        size: "1024x1536",
      },
    });
  }

  return { channel, project };
}

async function cleanup(projectId: string, channelId: string) {
  await prisma.timeline.deleteMany({ where: { projectId } });
  await prisma.audioSegment.deleteMany({ where: { projectId } });
  await prisma.imageAsset.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
  await prisma.channel.delete({ where: { id: channelId } });
}

describe("getOrSyncTimeline / syncTimeline", () => {
  it("최초 조회 시 자동으로 타임라인+트랙+클립을 생성한다", async () => {
    const { channel, project } = await createTestProject({
      segments: [
        { order: 0, text: "첫 문장", startMs: 0, endMs: 1000 },
        { order: 1, text: "둘째 문장", startMs: 1000, endMs: 2000 },
      ],
      images: [{ order: 0 }],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      expect(timeline?.durationMs).toBe(2000);
      expect(timeline?.tracks).toHaveLength(6);

      const subtitleTrack = timeline?.tracks.find((t) => t.type === "SUBTITLE");
      expect(subtitleTrack?.clips).toHaveLength(2);
      const imageTrack = timeline?.tracks.find((t) => t.type === "IMAGE");
      expect(imageTrack?.clips).toHaveLength(1);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("재동기화 시 수동으로 옮긴 클립의 시간은 보존하고 내용만 갱신한다", async () => {
    const { channel, project } = await createTestProject({
      segments: [{ order: 0, text: "원본 텍스트", startMs: 0, endMs: 1000 }],
      images: [],
    });
    try {
      const first = await getOrSyncTimeline(project.id);
      const subtitleClip = first!.tracks.find((t) => t.type === "SUBTITLE")!.clips[0];

      // 사용자가 드래그로 위치를 옮겼다고 가정 (updateClipTiming의 이웃-클램프는 별도 테스트에서 다루므로
      // 여기서는 "이미 저장된 임의의 시간"을 직접 반영한다)
      await prisma.timelineClip.update({ where: { id: subtitleClip.id }, data: { startMs: 200, endMs: 1200 } });

      // 스크립트 쪽 세그먼트 텍스트가 바뀜(다른 화면에서 TTS 재생성 등)
      await prisma.audioSegment.updateMany({ where: { projectId: project.id }, data: { text: "수정된 텍스트" } });

      const synced = await syncTimeline(project.id);
      const updatedClip = synced!.tracks.find((t) => t.type === "SUBTITLE")!.clips[0];

      expect(updatedClip.startMs).toBe(200); // 시간은 보존
      expect(updatedClip.endMs).toBe(1200);
      expect((updatedClip.payload as { text?: string }).text).toBe("수정된 텍스트"); // 내용은 갱신
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("원본 세그먼트가 삭제되면 해당 클립도 정리된다", async () => {
    const { channel, project } = await createTestProject({
      segments: [
        { order: 0, text: "첫 문장", startMs: 0, endMs: 1000 },
        { order: 1, text: "둘째 문장", startMs: 1000, endMs: 2000 },
      ],
      images: [],
    });
    try {
      await getOrSyncTimeline(project.id);
      await prisma.audioSegment.deleteMany({ where: { projectId: project.id, order: 1 } });

      const synced = await syncTimeline(project.id);
      const subtitleClips = synced!.tracks.find((t) => t.type === "SUBTITLE")!.clips;
      expect(subtitleClips).toHaveLength(1);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});

describe("updateClipTiming", () => {
  it("이웃 클립 경계를 넘지 못하도록 길이를 유지한 채 클램프한다", async () => {
    const { channel, project } = await createTestProject({
      segments: [
        { order: 0, text: "첫 문장", startMs: 0, endMs: 1000 },
        { order: 1, text: "둘째 문장", startMs: 1000, endMs: 2000 },
      ],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const clips = timeline!.tracks.find((t) => t.type === "SUBTITLE")!.clips;
      const firstClip = clips[0];

      // 두 번째 클립(1000~2000) 경계를 넘어가도록 무리하게 옮기려는 시도
      const updated = await updateClipTiming(firstClip.id, { startMs: 1500, endMs: 2500 });

      expect(updated.endMs).toBeLessThanOrEqual(1000); // 다음 클립 시작 전에서 멈춤
      expect(updated.endMs - updated.startMs).toBe(1000); // 길이(1초)는 유지
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});

describe("splitClip / deleteClip / restoreClipsSnapshot", () => {
  it("클립을 지정 시점에서 둘로 나눈다", async () => {
    const { channel, project } = await createTestProject({
      segments: [{ order: 0, text: "긴 문장", startMs: 0, endMs: 4000 }],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const clip = timeline!.tracks.find((t) => t.type === "SUBTITLE")!.clips[0];

      const { updated, created } = await splitClip(clip.id, 1500);

      expect(updated).toMatchObject({ startMs: 0, endMs: 1500 });
      expect(created).toMatchObject({ startMs: 1500, endMs: 4000, trackId: clip.trackId });
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("분할 지점이 클립 바깥이면 에러를 던진다", async () => {
    const { channel, project } = await createTestProject({
      segments: [{ order: 0, text: "문장", startMs: 0, endMs: 1000 }],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const clip = timeline!.tracks.find((t) => t.type === "SUBTITLE")!.clips[0];
      await expect(splitClip(clip.id, 2000)).rejects.toThrow("분할 지점");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("클립을 삭제할 수 있다", async () => {
    const { channel, project } = await createTestProject({
      segments: [{ order: 0, text: "문장", startMs: 0, endMs: 1000 }],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const clip = timeline!.tracks.find((t) => t.type === "SUBTITLE")!.clips[0];

      await deleteClip(clip.id);

      const remaining = await prisma.timelineClip.findMany({ where: { trackId: clip.trackId } });
      expect(remaining).toHaveLength(0);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("여러 클립의 시간을 한 번에 되돌릴 수 있다(실행 취소)", async () => {
    const { channel, project } = await createTestProject({
      segments: [
        { order: 0, text: "첫 문장", startMs: 0, endMs: 1000 },
        { order: 1, text: "둘째 문장", startMs: 2000, endMs: 3000 },
      ],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const clips = timeline!.tracks.find((t) => t.type === "SUBTITLE")!.clips;
      const snapshot = clips.map((c) => ({ id: c.id, trackId: c.trackId, startMs: c.startMs, endMs: c.endMs, payload: c.payload as unknown as PersistedClipPayload }));

      await updateClipTiming(clips[0].id, { startMs: 100, endMs: 100 + (clips[0].endMs - clips[0].startMs) });

      await restoreClipsSnapshot(snapshot);

      const restored = await prisma.timelineClip.findUniqueOrThrow({ where: { id: clips[0].id } });
      expect(restored.startMs).toBe(snapshot[0].startMs);
      expect(restored.endMs).toBe(snapshot[0].endMs);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("스냅샷 시점에 존재하던(그 뒤 삭제된) 클립을 원래 id로 재생성한다", async () => {
    const { channel, project } = await createTestProject({
      segments: [{ order: 0, text: "첫 문장", startMs: 0, endMs: 1000 }],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const clip = timeline!.tracks.find((t) => t.type === "SUBTITLE")!.clips[0];
      const snapshot = [{ id: clip.id, trackId: clip.trackId, startMs: clip.startMs, endMs: clip.endMs, payload: clip.payload as unknown as PersistedClipPayload }];

      await deleteClip(clip.id);
      expect(await prisma.timelineClip.findUnique({ where: { id: clip.id } })).toBeNull();

      await restoreClipsSnapshot(snapshot);

      const restored = await prisma.timelineClip.findUniqueOrThrow({ where: { id: clip.id } });
      expect(restored).toMatchObject({ trackId: clip.trackId, startMs: clip.startMs, endMs: clip.endMs });
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("스냅샷 시점 이후에 새로 생긴 클립은 되돌릴 때 제거한다", async () => {
    const { channel, project } = await createTestProject({
      segments: [{ order: 0, text: "긴 문장", startMs: 0, endMs: 4000 }],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const clip = timeline!.tracks.find((t) => t.type === "SUBTITLE")!.clips[0];
      const snapshot = [{ id: clip.id, trackId: clip.trackId, startMs: clip.startMs, endMs: clip.endMs, payload: clip.payload as unknown as PersistedClipPayload }];

      const { created } = await splitClip(clip.id, 1500);
      expect(await prisma.timelineClip.findUnique({ where: { id: created.id } })).not.toBeNull();

      await restoreClipsSnapshot(snapshot);

      expect(await prisma.timelineClip.findUnique({ where: { id: created.id } })).toBeNull();
      const remaining = await prisma.timelineClip.findMany({ where: { trackId: clip.trackId } });
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toMatchObject({ startMs: clip.startMs, endMs: clip.endMs });
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});

describe("updateClipText / applySubtitleLineLengthFix", () => {
  it("텍스트를 바꾸면서 sourceId는 그대로 유지한다", async () => {
    const { channel, project } = await createTestProject({
      segments: [{ order: 0, text: "원문", startMs: 0, endMs: 1000 }],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const clip = timeline!.tracks.find((t) => t.type === "SUBTITLE")!.clips[0];
      const originalSourceId = (clip.payload as { sourceId?: string }).sourceId;

      const updated = await updateClipText(clip.id, "새 텍스트");

      expect((updated.payload as { text?: string }).text).toBe("새 텍스트");
      expect((updated.payload as { sourceId?: string }).sourceId).toBe(originalSourceId);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("기준 글자수를 초과하는 자막에만 줄바꿈을 넣고 sourceId를 보존한다", async () => {
    const { channel, project } = await createTestProject({
      segments: [
        { order: 0, text: "짧은 자막", startMs: 0, endMs: 1000 },
        { order: 1, text: "이것은 열네 글자를 훌쩍 넘기는 아주 긴 자막 문장입니다", startMs: 1000, endMs: 2000 },
      ],
      images: [],
    });
    try {
      await getOrSyncTimeline(project.id);

      const result = await applySubtitleLineLengthFix(project.id);
      expect(result.fixedCount).toBe(1);

      const timeline = await getOrSyncTimeline(project.id);
      const clips = timeline!.tracks.find((t) => t.type === "SUBTITLE")!.clips;
      const longClip = clips.find((c) => (c.payload as { text?: string }).text?.includes("훌쩍"))!;
      expect((longClip.payload as { sourceId?: string }).sourceId).toBeTruthy();
      const lines = (longClip.payload as { text: string }).text.split("\n");
      expect(lines.every((l) => l.length <= 14)).toBe(true);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});

describe("duplicateClip", () => {
  it("바로 뒤 클립과 붙어있으면(여유 공간 없음) 에러를 던진다", async () => {
    const { channel, project } = await createTestProject({
      segments: [
        { order: 0, text: "첫 문장", startMs: 0, endMs: 1000 },
        { order: 1, text: "둘째 문장", startMs: 1000, endMs: 2000 },
      ],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const clip = timeline!.tracks.find((t) => t.type === "SUBTITLE")!.clips[0];
      await expect(duplicateClip(clip.id)).rejects.toThrow("복제할 공간");
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("트림으로 생긴 여유 공간에는 sourceId 없이 복제된다", async () => {
    const { channel, project } = await createTestProject({
      segments: [{ order: 0, text: "문장", startMs: 0, endMs: 1000 }],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const clip = timeline!.tracks.find((t) => t.type === "SUBTITLE")!.clips[0];
      // 클립을 트림해 뒤쪽에 여유 공간을 만든다(트랙 자체 길이 1000ms는 그대로 유지됨).
      await prisma.timelineClip.update({ where: { id: clip.id }, data: { endMs: 400 } });

      const duplicate = await duplicateClip(clip.id);
      expect(duplicate.startMs).toBe(400);
      expect(duplicate.endMs).toBe(800);
      expect((duplicate.payload as { sourceId?: string }).sourceId).toBeUndefined();
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});

describe("pasteClips / bulkDeleteClips", () => {
  it("붙여넣은 클립들을 atMs부터 순서대로 자리가 있는 만큼만 배치한다", async () => {
    const { channel, project } = await createTestProject({
      segments: [{ order: 0, text: "문장", startMs: 0, endMs: 1000 }],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const track = timeline!.tracks.find((t) => t.type === "SUBTITLE")!;
      await prisma.timelineClip.deleteMany({ where: { trackId: track.id } }); // 빈 트랙에서 붙여넣기 검증

      const created = await pasteClips(track.id, 0, [
        { payload: { label: "A" }, durationMs: 300 },
        { payload: { label: "B" }, durationMs: 300 },
      ]);

      expect(created).toHaveLength(2);
      expect(created[0]).toMatchObject({ startMs: 0, endMs: 300 });
      expect(created[1]).toMatchObject({ startMs: 300, endMs: 600 });
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("여러 클립을 한 번에 삭제한다", async () => {
    const { channel, project } = await createTestProject({
      segments: [
        { order: 0, text: "첫 문장", startMs: 0, endMs: 1000 },
        { order: 1, text: "둘째 문장", startMs: 1000, endMs: 2000 },
      ],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const clips = timeline!.tracks.find((t) => t.type === "SUBTITLE")!.clips;
      await bulkDeleteClips(clips.map((c) => c.id));

      const remaining = await prisma.timelineClip.findMany({ where: { trackId: clips[0].trackId } });
      expect(remaining).toHaveLength(0);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});

describe("removeTrackGaps / removeGapsBetweenClips", () => {
  it("트랙의 모든 클립을 빈틈없이 당겨 붙인다", async () => {
    const { channel, project } = await createTestProject({
      segments: [
        { order: 0, text: "첫 문장", startMs: 0, endMs: 1000 },
        { order: 1, text: "둘째 문장", startMs: 1000, endMs: 2000 },
      ],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const clips = timeline!.tracks.find((t) => t.type === "SUBTITLE")!.clips;
      // 트림으로 클립 사이에 빈틈을 만든다.
      await prisma.timelineClip.update({ where: { id: clips[0].id }, data: { endMs: 500 } });

      await removeTrackGaps(clips[0].trackId);

      const updated = await prisma.timelineClip.findMany({ where: { trackId: clips[0].trackId }, orderBy: { startMs: "asc" } });
      expect(updated.map((c) => [c.startMs, c.endMs])).toEqual([
        [0, 500],
        [500, 1500],
      ]);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("선택된 클립끼리만 당겨 붙인다", async () => {
    const { channel, project } = await createTestProject({
      segments: [
        { order: 0, text: "첫 문장", startMs: 0, endMs: 1000 },
        { order: 1, text: "둘째 문장", startMs: 1000, endMs: 2000 },
        { order: 2, text: "셋째 문장", startMs: 2000, endMs: 3000 },
      ],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const clips = timeline!.tracks.find((t) => t.type === "SUBTITLE")!.clips;
      await prisma.timelineClip.update({ where: { id: clips[1].id }, data: { startMs: 1500, endMs: 2000 } });

      await removeGapsBetweenClips([clips[1].id, clips[2].id]);

      const c1 = await prisma.timelineClip.findUniqueOrThrow({ where: { id: clips[1].id } });
      const c2 = await prisma.timelineClip.findUniqueOrThrow({ where: { id: clips[2].id } });
      expect([c1.startMs, c1.endMs]).toEqual([1500, 2000]);
      expect([c2.startMs, c2.endMs]).toEqual([2000, 3000]);

      const c0 = await prisma.timelineClip.findUniqueOrThrow({ where: { id: clips[0].id } });
      expect([c0.startMs, c0.endMs]).toEqual([0, 1000]); // 선택 안 된 클립은 그대로
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});

describe("addTtsBreathingGaps", () => {
  it("TTS와 자막 클립을 같은 폭만큼 밀어내고 타임라인 길이를 늘린다", async () => {
    const { channel, project } = await createTestProject({
      segments: [
        { order: 0, text: "첫 문장", startMs: 0, endMs: 1000 },
        { order: 1, text: "둘째 문장", startMs: 1000, endMs: 2000 },
      ],
      images: [],
    });
    try {
      await getOrSyncTimeline(project.id);
      const updated = await addTtsBreathingGaps(project.id, 300);

      const ttsClips = updated!.tracks.find((t) => t.type === "TTS")!.clips;
      const subtitleClips = updated!.tracks.find((t) => t.type === "SUBTITLE")!.clips;
      expect(ttsClips.map((c) => [c.startMs, c.endMs])).toEqual([
        [0, 1000],
        [1300, 2300],
      ]);
      expect(subtitleClips.map((c) => [c.startMs, c.endMs])).toEqual([
        [0, 1000],
        [1300, 2300],
      ]);
      expect(updated!.durationMs).toBe(2300);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});

describe("scaleTrackToTargetDuration", () => {
  it("트랙 전체를 목표 길이에 맞춰 비례 스케일한다", async () => {
    const { channel, project } = await createTestProject({
      segments: [
        { order: 0, text: "첫 문장", startMs: 0, endMs: 1000 },
        { order: 1, text: "둘째 문장", startMs: 1000, endMs: 2000 },
      ],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const clips = timeline!.tracks.find((t) => t.type === "SUBTITLE")!.clips;

      await scaleTrackToTargetDuration(clips[0].trackId, 4000);

      const updated = await prisma.timelineClip.findMany({ where: { trackId: clips[0].trackId }, orderBy: { startMs: "asc" } });
      expect(updated.map((c) => [c.startMs, c.endMs])).toEqual([
        [0, 2000],
        [2000, 4000],
      ]);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});

describe("updateAudioOptions", () => {
  it("속도를 바꾸면 (이전속도/새속도) 비율로 클립 길이가 바뀌고, 연결된 자막 클립도 같은 비율로 맞춰진다", async () => {
    const { channel, project } = await createTestProject({
      segments: [
        { order: 0, text: "첫 문장", startMs: 0, endMs: 1000 },
        { order: 1, text: "둘째 문장", startMs: 1000, endMs: 2000 },
      ],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const ttsClip = timeline!.tracks.find((t) => t.type === "TTS")!.clips[0];
      const subtitleClip = timeline!.tracks.find((t) => t.type === "SUBTITLE")!.clips[0];

      await updateAudioOptions(ttsClip.id, { speed: 2 });
      const afterSpeedUp = await prisma.timelineClip.findUniqueOrThrow({ where: { id: ttsClip.id } });
      expect(afterSpeedUp.endMs).toBe(500); // 1000ms / 2

      const linkedSubtitle = await prisma.timelineClip.findUniqueOrThrow({ where: { id: subtitleClip.id } });
      expect(linkedSubtitle.endMs).toBe(500);

      // 다시 기본 속도로 되돌리면 원래 길이로 복원된다 — toClipPayload가 audioOptions를 보존해야
      // "이전 속도"를 정확히 알 수 있다(이 필드가 누락되면 항상 기본값 1과 비교하게 되어 되돌아가지 않는 버그가 있었음).
      await updateAudioOptions(ttsClip.id, { speed: 1 });
      const afterRestore = await prisma.timelineClip.findUniqueOrThrow({ where: { id: ttsClip.id } });
      expect(afterRestore.endMs).toBe(1000);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("볼륨/음소거는 클립 길이에 영향을 주지 않는다", async () => {
    const { channel, project } = await createTestProject({
      segments: [{ order: 0, text: "첫 문장", startMs: 0, endMs: 1000 }],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const ttsClip = timeline!.tracks.find((t) => t.type === "TTS")!.clips[0];

      const updated = await updateAudioOptions(ttsClip.id, { volume: 0.5, muted: true });
      expect(updated.endMs).toBe(1000);
      expect(toPayloadAudioOptions(updated.payload)).toEqual({
        volume: 0.5,
        muted: true,
        speed: 1,
        fadeInMs: 0,
        fadeOutMs: 0,
      });
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});

function toPayloadAudioOptions(payload: unknown) {
  return (payload as { audioOptions?: unknown }).audioOptions;
}

describe("reorderTrack / updateTrackFlags", () => {
  it("트랙을 위로 옮기면 바로 앞 트랙과 order가 맞바뀐다", async () => {
    const { channel, project } = await createTestProject({
      segments: [{ order: 0, text: "문장", startMs: 0, endMs: 1000 }],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const sorted = [...timeline!.tracks].sort((a, b) => a.order - b.order);
      const [first, second] = sorted;

      await reorderTrack(second.id, "up");

      const updatedFirst = await prisma.timelineTrack.findUniqueOrThrow({ where: { id: first.id } });
      const updatedSecond = await prisma.timelineTrack.findUniqueOrThrow({ where: { id: second.id } });
      expect(updatedSecond.order).toBe(first.order);
      expect(updatedFirst.order).toBe(second.order);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("맨 위 트랙을 위로, 맨 아래 트랙을 아래로 옮기려 하면 아무 일도 일어나지 않는다", async () => {
    const { channel, project } = await createTestProject({
      segments: [{ order: 0, text: "문장", startMs: 0, endMs: 1000 }],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const sorted = [...timeline!.tracks].sort((a, b) => a.order - b.order);
      const firstTrack = sorted[0];
      const lastTrack = sorted[sorted.length - 1];

      await reorderTrack(firstTrack.id, "up");
      await reorderTrack(lastTrack.id, "down");

      const updatedFirst = await prisma.timelineTrack.findUniqueOrThrow({ where: { id: firstTrack.id } });
      const updatedLast = await prisma.timelineTrack.findUniqueOrThrow({ where: { id: lastTrack.id } });
      expect(updatedFirst.order).toBe(firstTrack.order);
      expect(updatedLast.order).toBe(lastTrack.order);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });

  it("visible/locked을 토글할 수 있다", async () => {
    const { channel, project } = await createTestProject({
      segments: [{ order: 0, text: "문장", startMs: 0, endMs: 1000 }],
      images: [],
    });
    try {
      const timeline = await getOrSyncTimeline(project.id);
      const track = timeline!.tracks[0];

      const updated = await updateTrackFlags(track.id, { visible: false, locked: true });
      expect(updated.visible).toBe(false);
      expect(updated.locked).toBe(true);
    } finally {
      await cleanup(project.id, channel.id);
    }
  });
});
