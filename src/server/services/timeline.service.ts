import type { Prisma, TimelineTrackType } from "@prisma/client";

import {
  analyzeSubtitleLineLength,
  buildTimelineTracks,
  clampClipTiming,
  computeSplitTimes,
  planClipSync,
  rewrapTextToMaxLineLength,
  type TimelineClip,
} from "@/lib/timeline";
import { prisma } from "@/lib/prisma";
import type { BgmSettings } from "@/server/services/bgm.service";
import { getBgmTrack, getEffectiveBgmSettings } from "@/server/services/bgm.service";

const TRACK_DEFS: { type: TimelineTrackType; name: string; order: number }[] = [
  { type: "SUBTITLE", name: "Subtitles", order: 0 },
  { type: "VIDEO", name: "Video 1", order: 1 },
  { type: "IMAGE", name: "Image", order: 2 },
  { type: "TTS", name: "TTS", order: 3 },
  { type: "AUDIO", name: "비디오 오디오", order: 4 },
  { type: "BGM", name: "BGM", order: 5 },
];

type ClipPayload = { sourceId?: string; label: string; text?: string };

function toClipPayload(payload: Prisma.JsonValue): ClipPayload {
  const p = payload as ClipPayload | null;
  return { sourceId: p?.sourceId, label: p?.label ?? "", text: p?.text };
}

export async function getTimeline(projectId: string) {
  return prisma.timeline.findUnique({
    where: { projectId },
    include: { tracks: { orderBy: { order: "asc" }, include: { clips: { orderBy: { startMs: "asc" } } } } },
  });
}

async function ensureTimelineShell(projectId: string) {
  const existing = await prisma.timeline.findUnique({ where: { projectId } });
  if (existing) return existing;

  return prisma.timeline.create({
    data: {
      projectId,
      tracks: { create: TRACK_DEFS.map((t) => ({ type: t.type, name: t.name, order: t.order })) },
    },
  });
}

async function loadSourceData(projectId: string) {
  const [script, images, audioSegments, bgmEffective] = await Promise.all([
    prisma.script.findUnique({ where: { projectId } }),
    prisma.imageAsset.findMany({ where: { projectId }, orderBy: { order: "asc" } }),
    prisma.audioSegment.findMany({ where: { projectId }, orderBy: { order: "asc" } }),
    getEffectiveBgmSettings(projectId),
  ]);

  let bgm: { title: string; durationSec: number | null; loop: boolean } | null = null;
  if (bgmEffective.settings) {
    const track = await getBgmTrack(bgmEffective.settings.trackId);
    if (track) {
      bgm = { title: track.title, durationSec: track.durationSec, loop: bgmEffective.settings.loop };
    }
  }

  return { script, images, audioSegments, bgm, bgmSettings: bgmEffective.settings as BgmSettings | null };
}

// PROJECT_SPEC.md §1.3 "동기화 로직": Script/ImageAsset/AudioSegment/BGM 설정 기준으로 클립을
// 생성·갱신·삭제한다. sourceId로 매칭되는 기존 클립은 시간(사용자 편집)을 보존하고 내용만 갱신한다.
// BGM 트랙은 반복 배치 특성상 매번 전체 재생성한다.
export async function syncTimeline(projectId: string) {
  const timeline = await ensureTimelineShell(projectId);
  const { images, audioSegments, bgm } = await loadSourceData(projectId);

  const desired = buildTimelineTracks({
    audioSegments: audioSegments.map((s) => ({ id: s.id, text: s.text, startMs: s.startMs, endMs: s.endMs })),
    images: images.map((i) => ({ id: i.id, order: i.order })),
    bgm,
  });

  const tracks = await prisma.timelineTrack.findMany({
    where: { timelineId: timeline.id },
    include: { clips: true },
  });

  for (const track of tracks) {
    const desiredTrack = desired.tracks.find((t) => t.type === track.type);
    if (!desiredTrack) continue;

    if (track.type === "BGM") {
      await prisma.timelineClip.deleteMany({ where: { trackId: track.id } });
      if (desiredTrack.clips.length > 0) {
        await prisma.timelineClip.createMany({
          data: desiredTrack.clips.map((c) => ({
            trackId: track.id,
            startMs: c.startMs,
            endMs: c.endMs,
            payload: { label: c.label } satisfies ClipPayload,
          })),
        });
      }
      continue;
    }

    if (track.type === "VIDEO" || track.type === "AUDIO") continue; // 원본 영상 업로드 기능 없음 — 항상 빈 트랙

    const existingLite = track.clips.map((c) => ({ id: c.id, ...toClipPayload(c.payload) }));
    const plan = planClipSync(existingLite, desiredTrack.clips);

    if (plan.toDeleteIds.length > 0) {
      await prisma.timelineClip.deleteMany({ where: { id: { in: plan.toDeleteIds } } });
    }
    for (const update of plan.toUpdate) {
      // payload는 JSON 필드라 전체 치환되므로, sourceId를 잃지 않도록 기존 값에서 가져와 함께 저장한다.
      const original = existingLite.find((e) => e.id === update.id);
      await prisma.timelineClip.update({
        where: { id: update.id },
        data: {
          payload: { sourceId: original?.sourceId, label: update.label, text: update.text } satisfies ClipPayload,
        },
      });
    }
    if (plan.toCreate.length > 0) {
      await prisma.timelineClip.createMany({
        data: plan.toCreate.map((c) => ({
          trackId: track.id,
          startMs: c.startMs,
          endMs: c.endMs,
          payload: { sourceId: c.sourceId, label: c.label, text: c.text } satisfies ClipPayload,
        })),
      });
    }
  }

  await prisma.timeline.update({ where: { id: timeline.id }, data: { durationMs: desired.durationMs } });

  return getTimeline(projectId);
}

export async function getOrSyncTimeline(projectId: string) {
  const existing = await getTimeline(projectId);
  if (existing) return existing;
  return syncTimeline(projectId);
}

async function getClipWithNeighborBounds(clipId: string) {
  const clip = await prisma.timelineClip.findUniqueOrThrow({ where: { id: clipId } });
  const siblings = await prisma.timelineClip.findMany({
    where: { trackId: clip.trackId, id: { not: clip.id } },
    orderBy: { startMs: "asc" },
  });
  const timeline = await prisma.timeline.findFirstOrThrow({
    where: { tracks: { some: { id: clip.trackId } } },
  });

  const prev = siblings.filter((s) => s.endMs <= clip.startMs).at(-1);
  const next = siblings.find((s) => s.startMs >= clip.endMs);

  return {
    clip,
    minMs: prev?.endMs ?? 0,
    maxMs: next?.startMs ?? timeline.durationMs,
  };
}

// 카드/드래그/트림: 같은 트랙 내 이웃 클립 경계 안으로 클램프해 저장한다.
export async function updateClipTiming(clipId: string, input: { startMs: number; endMs: number }) {
  const { minMs, maxMs } = await getClipWithNeighborBounds(clipId);
  const clamped = clampClipTiming({ startMs: input.startMs, endMs: input.endMs, minMs, maxMs });

  return prisma.timelineClip.update({ where: { id: clipId }, data: clamped });
}

export async function updateClipText(clipId: string, text: string) {
  const clip = await prisma.timelineClip.findUniqueOrThrow({ where: { id: clipId } });
  const payload = toClipPayload(clip.payload);
  return prisma.timelineClip.update({
    where: { id: clipId },
    data: { payload: { ...payload, label: text, text } satisfies ClipPayload },
  });
}

// 실행 취소/다시 실행: 클라이언트가 들고 있는 스냅샷으로 여러 클립의 시간을 한 번에 되돌린다.
export async function bulkRestoreClipTimings(updates: { id: string; startMs: number; endMs: number }[]) {
  await prisma.$transaction(
    updates.map((u) => prisma.timelineClip.update({ where: { id: u.id }, data: { startMs: u.startMs, endMs: u.endMs } })),
  );
}

export async function splitClip(clipId: string, atMs: number) {
  const clip = await prisma.timelineClip.findUniqueOrThrow({ where: { id: clipId } });
  const result = computeSplitTimes(clip, atMs);
  if (!result) {
    throw new Error("분할 지점이 클립 범위 안에 있어야 합니다.");
  }

  const [updated, created] = await prisma.$transaction([
    prisma.timelineClip.update({ where: { id: clipId }, data: result.first }),
    prisma.timelineClip.create({
      data: { trackId: clip.trackId, startMs: result.second.startMs, endMs: result.second.endMs, payload: clip.payload as Prisma.InputJsonValue },
    }),
  ]);

  return { updated, created };
}

export async function deleteClip(clipId: string) {
  await prisma.timelineClip.delete({ where: { id: clipId } });
}

// 품질 분석 "자막 줄 길이" 원클릭 수정: 초과한 자막 클립들의 텍스트에 줄바꿈만 추가한다.
export async function applySubtitleLineLengthFix(projectId: string, maxChars?: number) {
  const timeline = await ensureTimelineShell(projectId);
  const subtitleTrack = await prisma.timelineTrack.findFirstOrThrow({
    where: { timelineId: timeline.id, type: "SUBTITLE" },
    include: { clips: true },
  });

  const clipsWithText = subtitleTrack.clips.map((c) => ({
    id: c.id,
    sourceId: toClipPayload(c.payload).sourceId,
    text: toClipPayload(c.payload).text ?? "",
  }));
  const { exceedingIds } = analyzeSubtitleLineLength(clipsWithText, maxChars);
  const exceedingSet = new Set(exceedingIds);

  const updates = clipsWithText
    .filter((c) => exceedingSet.has(c.id))
    .map((c) => ({ id: c.id, sourceId: c.sourceId, text: rewrapTextToMaxLineLength(c.text, maxChars) }));

  for (const update of updates) {
    await prisma.timelineClip.update({
      where: { id: update.id },
      data: {
        payload: { sourceId: update.sourceId, label: update.text, text: update.text } satisfies ClipPayload,
      },
    });
  }

  return { fixedCount: updates.length };
}

export type { TimelineClip };
