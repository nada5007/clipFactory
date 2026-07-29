import type { Prisma, TimelineTrackType } from "@prisma/client";

import {
  analyzeSubtitleLineLength,
  buildTimelineTracks,
  clampClipTiming,
  computeSplitTimes,
  planClipSync,
  rewrapTextToMaxLineLength,
  type PersistedClipPayload,
  type SubtitleStyle,
  type TimelineClip,
  type VideoClipEffects,
  type VideoClipKeyframes,
  type VideoClipMask,
  type VideoClipOptions,
  type VideoClipTransform,
  type VideoClipTransition,
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

type ClipPayload = PersistedClipPayload;

// payload는 JSON 필드라 update 시 전체 치환되므로, 여기서 항상 "기존 값 전체"를 읽어와야
// style/transform/sourceOffsetMs 등 이번에 건드리지 않는 필드를 잃지 않는다.
function toClipPayload(payload: Prisma.JsonValue): ClipPayload {
  const p = payload as ClipPayload | null;
  return {
    sourceId: p?.sourceId,
    label: p?.label ?? "",
    text: p?.text,
    sourceOffsetMs: p?.sourceOffsetMs,
    style: p?.style,
    transform: p?.transform,
    effects: p?.effects,
    transition: p?.transition,
    videoOptions: p?.videoOptions,
    mask: p?.mask,
    keyframes: p?.keyframes,
  };
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

    const originalPayloadById = new Map(track.clips.map((c) => [c.id, toClipPayload(c.payload)]));
    const existingLite = track.clips.map((c) => ({ id: c.id, ...toClipPayload(c.payload) }));
    const plan = planClipSync(existingLite, desiredTrack.clips);

    if (plan.toDeleteIds.length > 0) {
      await prisma.timelineClip.deleteMany({ where: { id: { in: plan.toDeleteIds } } });
    }
    for (const update of plan.toUpdate) {
      // payload는 JSON 필드라 전체 치환되므로, style/sourceOffsetMs 등을 잃지 않도록 기존 전체 값 위에 덮어쓴다.
      const original = originalPayloadById.get(update.id) ?? { label: update.label };
      await prisma.timelineClip.update({
        where: { id: update.id },
        data: {
          payload: { ...original, label: update.label, text: update.text } satisfies ClipPayload,
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
// 트림(시작만 또는 끝만 이동)인 경우 sourceOffsetMs를 함께 조정해, 렌더링 시 TTS 원본 오디오에서
// 실제로 잘라내야 할 지점을 추적한다. 순수 이동(양끝이 같은 폭만큼 이동)이면 원본 재생 구간은 그대로다.
export async function updateClipTiming(clipId: string, input: { startMs: number; endMs: number }) {
  const { clip, minMs, maxMs } = await getClipWithNeighborBounds(clipId);
  const clamped = clampClipTiming({ startMs: input.startMs, endMs: input.endMs, minMs, maxMs });

  const deltaStart = clamped.startMs - clip.startMs;
  const deltaEnd = clamped.endMs - clip.endMs;
  const isPureMove = deltaStart === deltaEnd;
  const payload = toClipPayload(clip.payload);
  const nextSourceOffsetMs = isPureMove ? (payload.sourceOffsetMs ?? 0) : (payload.sourceOffsetMs ?? 0) + deltaStart;

  return prisma.timelineClip.update({
    where: { id: clipId },
    data: { ...clamped, payload: { ...payload, sourceOffsetMs: nextSourceOffsetMs } satisfies ClipPayload },
  });
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

  // 뒤쪽 조각은 원본 소스에서 (atMs - 원래 시작 지점)만큼 더 들어간 지점부터 시작한다(TTS 오디오 트림 기준점).
  const payload = toClipPayload(clip.payload);
  const secondPayload: ClipPayload = {
    ...payload,
    sourceOffsetMs: (payload.sourceOffsetMs ?? 0) + (atMs - clip.startMs),
  };

  const [updated, created] = await prisma.$transaction([
    prisma.timelineClip.update({ where: { id: clipId }, data: result.first }),
    prisma.timelineClip.create({
      data: {
        trackId: clip.trackId,
        startMs: result.second.startMs,
        endMs: result.second.endMs,
        payload: secondPayload as Prisma.InputJsonValue,
      },
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

  const originalPayloadById = new Map(subtitleTrack.clips.map((c) => [c.id, toClipPayload(c.payload)]));
  const clipsWithText = subtitleTrack.clips.map((c) => ({
    id: c.id,
    text: toClipPayload(c.payload).text ?? "",
  }));
  const { exceedingIds } = analyzeSubtitleLineLength(clipsWithText, maxChars);
  const exceedingSet = new Set(exceedingIds);

  const updates = clipsWithText
    .filter((c) => exceedingSet.has(c.id))
    .map((c) => ({ id: c.id, text: rewrapTextToMaxLineLength(c.text, maxChars) }));

  for (const update of updates) {
    const original = originalPayloadById.get(update.id) ?? { label: update.text };
    await prisma.timelineClip.update({
      where: { id: update.id },
      data: {
        payload: { ...original, label: update.text, text: update.text } satisfies ClipPayload,
      },
    });
  }

  return { fixedCount: updates.length };
}

// 자막 클립 스타일 편집(§5.2 "스타일" 탭). 지정한 필드만 병합해 저장한다.
export async function updateClipStyle(clipId: string, style: Partial<SubtitleStyle>) {
  const clip = await prisma.timelineClip.findUniqueOrThrow({ where: { id: clipId } });
  const payload = toClipPayload(clip.payload);
  return prisma.timelineClip.update({
    where: { id: clipId },
    data: { payload: { ...payload, style: { ...payload.style, ...style } } satisfies ClipPayload },
  });
}

// "모든 자막에 스타일 적용" 체크박스: 프로젝트의 SUBTITLE 트랙 전체 클립에 동일 스타일을 병합한다.
export async function applyStyleToAllSubtitles(projectId: string, style: Partial<SubtitleStyle>) {
  const timeline = await ensureTimelineShell(projectId);
  const subtitleTrack = await prisma.timelineTrack.findFirstOrThrow({
    where: { timelineId: timeline.id, type: "SUBTITLE" },
    include: { clips: true },
  });

  await prisma.$transaction(
    subtitleTrack.clips.map((c) => {
      const payload = toClipPayload(c.payload);
      return prisma.timelineClip.update({
        where: { id: c.id },
        data: { payload: { ...payload, style: { ...payload.style, ...style } } satisfies ClipPayload },
      });
    }),
  );

  return getTimeline(projectId);
}

// 비디오 클립 속성 편집(§5.2 변환/비디오 효과/전환/비디오 옵션/마스크/키프레임 탭).
// VIDEO 트랙은 아직 업로드 기능이 없어 실제로 호출될 일은 없지만, 클립이 생기면 그대로 동작한다.
export async function updateClipVideoProps(
  clipId: string,
  props: {
    transform?: Partial<VideoClipTransform>;
    effects?: Partial<VideoClipEffects>;
    transition?: Partial<VideoClipTransition>;
    videoOptions?: Partial<VideoClipOptions>;
    mask?: VideoClipMask;
    keyframes?: VideoClipKeyframes;
  },
) {
  const clip = await prisma.timelineClip.findUniqueOrThrow({ where: { id: clipId } });
  const payload = toClipPayload(clip.payload);
  const next: ClipPayload = { ...payload };
  if (props.transform !== undefined) next.transform = { ...payload.transform, ...props.transform };
  if (props.effects !== undefined) next.effects = { ...payload.effects, ...props.effects };
  if (props.transition !== undefined) next.transition = { ...payload.transition, ...props.transition };
  if (props.videoOptions !== undefined) next.videoOptions = { ...payload.videoOptions, ...props.videoOptions };
  if (props.mask !== undefined) next.mask = props.mask;
  if (props.keyframes !== undefined) next.keyframes = { ...payload.keyframes, ...props.keyframes };

  return prisma.timelineClip.update({ where: { id: clipId }, data: { payload: next satisfies ClipPayload } });
}

export type { TimelineClip };
