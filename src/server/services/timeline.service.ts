import type { Prisma, TimelineTrackType } from "@prisma/client";

import {
  analyzeSubtitleLineLength,
  buildTimelineTracks,
  clampClipTiming,
  computeSplitTimes,
  DEFAULT_AUDIO_OPTIONS,
  insertBreathingGaps,
  planClipSync,
  removeGapsBetweenSelectedClips,
  removeGapsInClips,
  rewrapTextToMaxLineLength,
  scaleClipsToTargetDuration,
  type AudioClipOptions,
  type PersistedClipPayload,
  type SubtitleStyle,
  type TimelineClip,
  type ImageClipEffects,
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
    mediaId: p?.mediaId,
    mediaKind: p?.mediaKind,
    style: p?.style,
    transform: p?.transform,
    effects: p?.effects,
    transition: p?.transition,
    videoOptions: p?.videoOptions,
    mask: p?.mask,
    keyframes: p?.keyframes,
    audioOptions: p?.audioOptions,
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

  // 사용자가 "트랙 추가"로 만든 트랙(autoSync=false)은 동기화 대상이 아니다 — 절대 만들거나 지우지 않는다.
  const tracks = await prisma.timelineTrack.findMany({
    where: { timelineId: timeline.id, autoSync: true },
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

async function getTrackMaxZIndex(trackId: string, excludeClipId: string): Promise<number> {
  const result = await prisma.timelineClip.aggregate({
    where: { trackId, id: { not: excludeClipId } },
    _max: { zIndex: true },
  });
  return result._max.zIndex ?? 0;
}

// 카드/드래그/트림: 순수 이동(양끝이 같은 폭만큼 이동 = 드래그로 위치만 옮김)은 이웃 클립과 겹쳐도
// 되는 자유 이동을 허용하고, 옮긴 클립이 항상 위에 보이도록 zIndex를 그 트랙의 최댓값+1로 올린다
// (§1.3 "자유 드래그+오버랩"). 트림(시작만 또는 끝만 이동)은 기존처럼 이웃 클립 경계 안으로 클램프한다.
// 트림인 경우 sourceOffsetMs를 함께 조정해, 렌더링 시 TTS 원본 오디오에서 실제로 잘라내야 할 지점을 추적한다.
export async function updateClipTiming(clipId: string, input: { startMs: number; endMs: number }) {
  const clip = await prisma.timelineClip.findUniqueOrThrow({ where: { id: clipId } });
  const originalDuration = clip.endMs - clip.startMs;
  const requestedDuration = input.endMs - input.startMs;
  const isPureMove = requestedDuration === originalDuration;

  let clamped: { startMs: number; endMs: number };
  let zIndex: number | undefined;

  if (isPureMove) {
    const timeline = await prisma.timeline.findFirstOrThrow({ where: { tracks: { some: { id: clip.trackId } } } });
    clamped = clampClipTiming({ startMs: input.startMs, endMs: input.endMs, minMs: 0, maxMs: timeline.durationMs });
    zIndex = (await getTrackMaxZIndex(clip.trackId, clip.id)) + 1;
  } else {
    const { minMs, maxMs } = await getClipWithNeighborBounds(clipId);
    clamped = clampClipTiming({ startMs: input.startMs, endMs: input.endMs, minMs, maxMs });
  }

  const deltaStart = clamped.startMs - clip.startMs;
  const deltaEnd = clamped.endMs - clip.endMs;
  const stillPureMove = deltaStart === deltaEnd;
  const payload = toClipPayload(clip.payload);
  const nextSourceOffsetMs = stillPureMove ? (payload.sourceOffsetMs ?? 0) : (payload.sourceOffsetMs ?? 0) + deltaStart;

  return prisma.timelineClip.update({
    where: { id: clipId },
    data: {
      ...clamped,
      ...(zIndex !== undefined ? { zIndex } : {}),
      payload: { ...payload, sourceOffsetMs: nextSourceOffsetMs } satisfies ClipPayload,
    },
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

// 실행 취소/다시 실행: 클라이언트가 들고 있는 "그 시점 전체 클립 목록" 스냅샷으로 되돌린다.
// 스냅샷에 없는(그 뒤에 새로 생긴) 클립은 삭제하고, 스냅샷에 있는데 지금 없는(그 뒤에 삭제된) 클립은
// 원래 id 그대로 재생성하며, 남아있는 클립은 시간/payload를 스냅샷 값으로 되돌린다.
export async function restoreClipsSnapshot(
  snapshot: {
    id: string;
    trackId: string;
    startMs: number;
    endMs: number;
    zIndex?: number;
    payload: PersistedClipPayload;
  }[],
) {
  const trackIds = Array.from(new Set(snapshot.map((s) => s.trackId)));
  const current = await prisma.timelineClip.findMany({ where: { trackId: { in: trackIds } } });
  const snapshotIds = new Set(snapshot.map((s) => s.id));
  const toDeleteIds = current.filter((c) => !snapshotIds.has(c.id)).map((c) => c.id);

  await prisma.$transaction([
    ...(toDeleteIds.length > 0 ? [prisma.timelineClip.deleteMany({ where: { id: { in: toDeleteIds } } })] : []),
    ...snapshot.map((s) =>
      prisma.timelineClip.upsert({
        where: { id: s.id },
        create: {
          id: s.id,
          trackId: s.trackId,
          startMs: s.startMs,
          endMs: s.endMs,
          zIndex: s.zIndex ?? 0,
          payload: s.payload as Prisma.InputJsonValue,
        },
        update: { startMs: s.startMs, endMs: s.endMs, zIndex: s.zIndex ?? 0, payload: s.payload as Prisma.InputJsonValue },
      }),
    ),
  ]);
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
        zIndex: clip.zIndex, // 분할 전 우선순위를 두 조각 모두 그대로 유지한다.
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
    where: { timelineId: timeline.id, type: "SUBTITLE", autoSync: true },
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
    where: { timelineId: timeline.id, type: "SUBTITLE", autoSync: true },
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
    effects?: Partial<ImageClipEffects>;
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

// TTS/BGM 클립 전용 오디오 옵션(볼륨/음소거/속도) 편집. 속도가 바뀌면 (이전속도/새속도) 비율만큼
// 클립 길이를 재계산하고, sourceId가 같은 SUBTITLE 클립(TTS와 같은 스크립트 세그먼트 유래)이 있으면
// 동일 비율로 길이를 맞춘다. 다음 클립과 겹치지 않도록 클램프하되, 이후 클립들을 밀어서 간격을
// 유지해주지는 않는다(호흡구간 추가처럼 전체 캐스케이드하지 않음 — 알려진 단순화).
export async function updateAudioOptions(clipId: string, patch: Partial<AudioClipOptions>) {
  const clip = await prisma.timelineClip.findUniqueOrThrow({ where: { id: clipId } });
  const payload = toClipPayload(clip.payload);
  const prevOptions = { ...DEFAULT_AUDIO_OPTIONS, ...payload.audioOptions };
  const nextOptions = { ...prevOptions, ...patch };
  const ratio = prevOptions.speed / nextOptions.speed;

  let endMs = clip.endMs;
  if (ratio !== 1) {
    const desiredDuration = Math.max(100, Math.round((clip.endMs - clip.startMs) * ratio));
    const nextSibling = await prisma.timelineClip.findFirst({
      where: { trackId: clip.trackId, startMs: { gte: clip.endMs }, id: { not: clip.id } },
      orderBy: { startMs: "asc" },
    });
    const maxDuration = nextSibling ? nextSibling.startMs - clip.startMs : desiredDuration;
    endMs = clip.startMs + Math.min(desiredDuration, maxDuration);
  }

  const updated = await prisma.timelineClip.update({
    where: { id: clip.id },
    data: { endMs, payload: { ...payload, audioOptions: nextOptions } satisfies ClipPayload },
  });

  if (ratio !== 1 && payload.sourceId) {
    const timeline = await prisma.timeline.findFirstOrThrow({ where: { tracks: { some: { id: clip.trackId } } } });
    const subtitleTrack = await prisma.timelineTrack.findFirst({
      where: { timelineId: timeline.id, type: "SUBTITLE", autoSync: true },
      include: { clips: true },
    });
    const subClip = subtitleTrack?.clips.find((c) => toClipPayload(c.payload).sourceId === payload.sourceId);
    if (subClip) {
      const desiredSubDuration = Math.max(100, Math.round((subClip.endMs - subClip.startMs) * ratio));
      const nextSubSibling = await prisma.timelineClip.findFirst({
        where: { trackId: subClip.trackId, startMs: { gte: subClip.endMs }, id: { not: subClip.id } },
        orderBy: { startMs: "asc" },
      });
      const maxSubDuration = nextSubSibling ? nextSubSibling.startMs - subClip.startMs : desiredSubDuration;
      const subEndMs = subClip.startMs + Math.min(desiredSubDuration, maxSubDuration);
      await prisma.timelineClip.update({ where: { id: subClip.id }, data: { endMs: subEndMs } });
    }
  }

  return updated;
}

// "모든 TTS/BGM에 설정 적용" 체크박스 — 같은 트랙의 클립 전체에 동일 오디오 옵션을 적용한다.
export async function applyAudioOptionsToTrack(projectId: string, trackId: string, patch: Partial<AudioClipOptions>) {
  const clips = await prisma.timelineClip.findMany({ where: { trackId } });
  for (const c of clips) {
    await updateAudioOptions(c.id, patch);
  }
  return getTimeline(projectId);
}

// 복제(Ctrl+D): 원본 클립 바로 뒤에 같은 길이로 삽입한다(다음 클립 경계 안으로 클램프, 자리가 없으면 에러).
// sourceId는 비워서 동기화 매칭 대상에서 제외한다(분할처럼 sourceId가 중복되는 문제를 피하기 위함 — 알려진 이슈).
export async function duplicateClip(clipId: string) {
  const clip = await prisma.timelineClip.findUniqueOrThrow({ where: { id: clipId } });
  const duration = clip.endMs - clip.startMs;
  const timeline = await prisma.timeline.findFirstOrThrow({ where: { tracks: { some: { id: clip.trackId } } } });
  const next = await prisma.timelineClip.findFirst({
    where: { trackId: clip.trackId, startMs: { gte: clip.endMs }, id: { not: clip.id } },
    orderBy: { startMs: "asc" },
  });
  const maxMs = next?.startMs ?? timeline.durationMs;
  const startMs = clip.endMs;
  const endMs = Math.min(startMs + duration, maxMs);
  if (endMs <= startMs) {
    throw new Error("복제할 공간이 없습니다. 뒤 클립과 붙어 있으면 먼저 자리를 만들어주세요.");
  }

  const payload = toClipPayload(clip.payload);
  const duplicatePayload: ClipPayload = { ...payload, sourceId: undefined };
  return prisma.timelineClip.create({
    data: { trackId: clip.trackId, startMs, endMs, payload: duplicatePayload as Prisma.InputJsonValue },
  });
}

// 붙여넣기(Ctrl+V): 클립보드에 담긴 클립(들)을 atMs부터 순서대로 삽입한다. 뒤 클립을 밀어내는 리플 삽입은
// 하지 않고, 기존 드래그/트림처럼 이웃 경계 안으로 클램프해 배치한다(자리가 부족하면 그 뒤 항목은 생략).
export async function pasteClips(
  trackId: string,
  atMs: number,
  items: { payload: ClipPayload; durationMs: number }[],
) {
  const timeline = await prisma.timeline.findFirstOrThrow({ where: { tracks: { some: { id: trackId } } } });
  const existing = await prisma.timelineClip.findMany({ where: { trackId }, orderBy: { startMs: "asc" } });

  const created = [];
  let cursor = atMs;
  for (const item of items) {
    const next = existing.find((c) => c.startMs >= cursor);
    const maxMs = next?.startMs ?? timeline.durationMs;
    const startMs = cursor;
    const endMs = Math.min(startMs + item.durationMs, maxMs);
    if (endMs <= startMs) break;

    const clip = await prisma.timelineClip.create({
      data: {
        trackId,
        startMs,
        endMs,
        payload: { ...item.payload, sourceId: undefined } as Prisma.InputJsonValue,
      },
    });
    created.push(clip);
    existing.push(clip);
    existing.sort((a, b) => a.startMs - b.startMs);
    cursor = endMs;
  }

  return created;
}

// 멀티 셀렉트 삭제 / 잘라내기(Ctrl+X)에서 재사용.
export async function bulkDeleteClips(clipIds: string[]) {
  await prisma.timelineClip.deleteMany({ where: { id: { in: clipIds } } });
}

// "전체 갭 제거": 트랙의 모든 클립을 순서대로 빈틈없이 당겨 붙인다.
export async function removeTrackGaps(trackId: string) {
  const clips = await prisma.timelineClip.findMany({ where: { trackId } });
  const updates = removeGapsInClips(clips);
  await prisma.$transaction(
    updates.map((u) => prisma.timelineClip.update({ where: { id: u.id }, data: { startMs: u.startMs, endMs: u.endMs } })),
  );
}

// 멀티 셀렉트 "선택 클립 사이 갭만 제거": 선택된 클립끼리만 첫 클립 위치부터 당겨 붙인다.
export async function removeGapsBetweenClips(clipIds: string[]) {
  const clips = await prisma.timelineClip.findMany({ where: { id: { in: clipIds } } });
  if (clips.length === 0) return;
  const trackId = clips[0].trackId;
  if (clips.some((c) => c.trackId !== trackId)) {
    throw new Error("같은 트랙의 클립만 선택해주세요.");
  }
  const updates = removeGapsBetweenSelectedClips(clips, new Set(clipIds));
  await prisma.$transaction(
    updates.map((u) => prisma.timelineClip.update({ where: { id: u.id }, data: { startMs: u.startMs, endMs: u.endMs } })),
  );
}

// TTS 호흡구간 추가: TTS·자막 클립은 항상 같은 순서 구조로 동기화되므로, 같은 인덱스만큼 함께 밀어내 싱크를 유지한다.
export async function addTtsBreathingGaps(projectId: string, gapMs: number) {
  const timeline = await ensureTimelineShell(projectId);
  const ttsTrack = await prisma.timelineTrack.findFirstOrThrow({
    where: { timelineId: timeline.id, type: "TTS", autoSync: true },
    include: { clips: { orderBy: { startMs: "asc" } } },
  });
  const subtitleTrack = await prisma.timelineTrack.findFirstOrThrow({
    where: { timelineId: timeline.id, type: "SUBTITLE", autoSync: true },
    include: { clips: { orderBy: { startMs: "asc" } } },
  });

  const ttsUpdates = insertBreathingGaps(ttsTrack.clips, gapMs);
  const subtitleUpdates = insertBreathingGaps(subtitleTrack.clips, gapMs);

  await prisma.$transaction([
    ...ttsUpdates.map((u) => prisma.timelineClip.update({ where: { id: u.id }, data: { startMs: u.startMs, endMs: u.endMs } })),
    ...subtitleUpdates.map((u) => prisma.timelineClip.update({ where: { id: u.id }, data: { startMs: u.startMs, endMs: u.endMs } })),
  ]);

  const addedMs = gapMs * Math.max(0, ttsTrack.clips.length - 1);
  await prisma.timeline.update({ where: { id: timeline.id }, data: { durationMs: timeline.durationMs + addedMs } });

  return getTimeline(projectId);
}

// 목표 길이 맞추기: 트랙 전체(0~마지막 클립 끝)를 targetDurationMs로 비례 스케일한다.
// TTS 트랙에 쓰면 클립 길이(재생 시간)가 바뀌는데, 현재 렌더링은 오디오를 자르거나 무음으로 채우는 방식이라
// 실제 배속(atempo) 처리는 하지 않는다 — 알려진 제약.
export async function scaleTrackToTargetDuration(trackId: string, targetDurationMs: number) {
  const clips = await prisma.timelineClip.findMany({ where: { trackId } });
  const updates = scaleClipsToTargetDuration(clips, targetDurationMs);
  await prisma.$transaction(
    updates.map((u) => prisma.timelineClip.update({ where: { id: u.id }, data: { startMs: u.startMs, endMs: u.endMs } })),
  );
}

const TRACK_TYPE_LABELS: Record<TimelineTrackType, string> = {
  SUBTITLE: "자막",
  VIDEO: "비디오",
  IMAGE: "이미지",
  TTS: "TTS",
  AUDIO: "오디오",
  BGM: "BGM",
  SFX: "효과음",
};

// "트랙 추가": 사용자가 직접 만드는 트랙은 항상 autoSync=false라 syncTimeline이 절대 건드리지 않는다.
// BGM은 참조 사이트와 동일하게 최대 2개(자동 1개 + 수동 1개)로 제한한다.
export async function addTrack(projectId: string, type: TimelineTrackType, name?: string) {
  const timeline = await ensureTimelineShell(projectId);

  if (type === "BGM") {
    const bgmCount = await prisma.timelineTrack.count({ where: { timelineId: timeline.id, type: "BGM" } });
    if (bgmCount >= 2) {
      throw new Error("BGM 트랙은 최대 2개까지 추가할 수 있습니다.");
    }
  }

  const [maxOrder, sameTypeCount] = await Promise.all([
    prisma.timelineTrack.aggregate({ where: { timelineId: timeline.id }, _max: { order: true } }),
    prisma.timelineTrack.count({ where: { timelineId: timeline.id, type } }),
  ]);

  return prisma.timelineTrack.create({
    data: {
      timelineId: timeline.id,
      type,
      name: name?.trim() || `${TRACK_TYPE_LABELS[type]} ${sameTypeCount + 1}`,
      order: (maxOrder._max.order ?? -1) + 1,
      autoSync: false,
    },
  });
}

export async function removeTrack(trackId: string) {
  // 사용자 결정(2026-08-13): 자동 트랙도 삭제 허용(클라이언트에서 클립이 있으면 확인 팝업). 파이프라인이
  // 필요로 하는 자동 트랙(VIDEO/AUDIO/SUBTITLE 등)은 해당 단계 재실행 시 ensureAutoTrack으로 재생성된다.
  await prisma.timelineTrack.delete({ where: { id: trackId } });
}

// 특정 타입의 autoSync 트랙을 반환하되, (사용자가 삭제해) 없으면 TRACK_DEFS 기준으로 다시 만들어 준다.
// 파이프라인 단계(하이라이트 트랙/자막 생성 등)가 삭제된 자동 트랙 때문에 실패하지 않도록 하는 안전장치.
export async function ensureAutoTrack(timelineId: string, type: TimelineTrackType) {
  const existing = await prisma.timelineTrack.findFirst({ where: { timelineId, type, autoSync: true } });
  if (existing) return existing;
  const def = TRACK_DEFS.find((d) => d.type === type);
  return prisma.timelineTrack.create({
    data: { timelineId, type, name: def?.name ?? type, order: def?.order ?? 99, autoSync: true },
  });
}

// 트랙 헤더의 보이기/숨기기(visible)·잠금(locked) 토글.
export async function updateTrackFlags(trackId: string, patch: { visible?: boolean; locked?: boolean }) {
  return prisma.timelineTrack.update({ where: { id: trackId }, data: patch });
}

// 트랙 상하 이동: 트랙 타입과 무관하게 같은 타임라인의 전체 트랙을 order 기준으로 정렬한 목록에서
// 바로 위/아래 트랙과 order 값을 맞바꾼다. 이 순서가 같은 타입 소스 간 미리보기/렌더링 표출 우선순위가 된다.
export async function reorderTrack(trackId: string, direction: "up" | "down") {
  const track = await prisma.timelineTrack.findUniqueOrThrow({ where: { id: trackId } });
  if (track.locked) {
    throw new Error("잠긴 트랙은 순서를 바꿀 수 없습니다.");
  }
  const siblings = await prisma.timelineTrack.findMany({
    where: { timelineId: track.timelineId },
    orderBy: { order: "asc" },
  });
  const idx = siblings.findIndex((t) => t.id === trackId);
  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= siblings.length) return;

  const target = siblings[targetIdx];
  if (target.locked) {
    throw new Error("잠긴 트랙과는 순서를 바꿀 수 없습니다.");
  }
  await prisma.$transaction([
    prisma.timelineTrack.update({ where: { id: track.id }, data: { order: target.order } }),
    prisma.timelineTrack.update({ where: { id: target.id }, data: { order: track.order } }),
  ]);
}

// "직접 업로드"로 트랙에 클립을 추가한다. 렌더링에는 아직 연결되지 않는다(§1.3 "트랙/클립 추가" 참고).
export async function addUploadedMediaClip(
  trackId: string,
  atMs: number,
  media: { id: string; kind: "video" | "image" | "audio"; durationMs: number | null; label: string },
) {
  const timeline = await prisma.timeline.findFirstOrThrow({ where: { tracks: { some: { id: trackId } } } });
  const existing = await prisma.timelineClip.findMany({ where: { trackId }, orderBy: { startMs: "asc" } });
  const next = existing.find((c) => c.startMs >= atMs);
  const maxMs = next?.startMs ?? timeline.durationMs;

  const durationMs = media.durationMs ?? 3000; // 이미지처럼 고정 길이가 없으면 3초 기본값
  const startMs = atMs;
  const endMs = Math.min(startMs + durationMs, maxMs);
  if (endMs <= startMs) {
    throw new Error("클립을 추가할 공간이 없습니다.");
  }

  const payload: ClipPayload = { label: media.label, mediaId: media.id, mediaKind: media.kind };
  return prisma.timelineClip.create({
    data: { trackId, startMs, endMs, payload: payload as Prisma.InputJsonValue },
  });
}

export type { TimelineClip };
