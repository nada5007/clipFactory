import path from "node:path";

import type { Prisma } from "@prisma/client";

import { inferBgmCategory } from "@/lib/bgm-category";
import { getAudioDurationMs } from "@/lib/ffmpeg";
import { prisma } from "@/lib/prisma";
import { resolveProjectFilePath, writeProjectFile } from "@/lib/storage";
import { downloadAudioAsMp3, fetchChannelEntries } from "@/lib/ytdlp";
import fs from "node:fs/promises";

// BgmTrack은 특정 프로젝트에 속하지 않는 전역 라이브러리다. storage/{projectId}/ 규칙을
// 그대로 재사용하기 위해 실제 projectId가 아닌 고정 키를 "가짜 projectId"로 사용한다.
const BGM_LIBRARY_KEY = "_bgm-library";
const BGM_CHANNEL_URL = "https://www.youtube.com/channel/UC7oH_BYk5rSP0JF7IDn-jRQ/videos";
const DEFAULT_MAX_VIDEOS = 20;

export function listBgmTracks(category?: string) {
  return prisma.bgmTrack.findMany({
    where: { isActive: true, ...(category ? { category } : {}) },
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });
}

export function getBgmTrack(id: string) {
  return prisma.bgmTrack.findFirst({ where: { id, isActive: true } });
}

// PROJECT_SPEC.md §1.3 "BGM 설정": 신규 트랙만 골라 yt-dlp로 오디오를 추출해 라이브러리에 추가한다.
// 개별 다운로드 실패는 건너뛰고 계속 진행한다 (한 곡 실패로 전체가 멈추지 않도록).
export async function syncBgmLibrary(maxVideos = DEFAULT_MAX_VIDEOS): Promise<number> {
  const entries = await fetchChannelEntries(BGM_CHANNEL_URL, maxVideos);
  if (entries.length === 0) return 0;

  const known = await prisma.bgmTrack.findMany({
    where: { youtubeId: { not: null } },
    select: { youtubeId: true },
  });
  const existingIds = new Set(known.map((t) => t.youtubeId));

  let downloaded = 0;
  for (const entry of entries) {
    if (!entry.id || existingIds.has(entry.id)) continue;

    const relativePath = `${entry.id}.mp3`;
    const fullPath = resolveProjectFilePath(BGM_LIBRARY_KEY, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    try {
      await downloadAudioAsMp3(`https://www.youtube.com/watch?v=${entry.id}`, fullPath);
    } catch {
      existingIds.add(entry.id);
      continue;
    }

    await prisma.bgmTrack.create({
      data: {
        youtubeId: entry.id,
        title: entry.title,
        category: inferBgmCategory(entry.title),
        durationSec: entry.durationSec,
        filePath: relativePath,
        source: "bgmpresident",
      },
    });
    existingIds.add(entry.id);
    downloaded++;
  }

  return downloaded;
}

export async function uploadBgmTrack(input: { title: string; category: string; buffer: Buffer }) {
  const id = `upload_${Date.now()}`;
  const relativePath = `${id}.mp3`;
  await writeProjectFile(BGM_LIBRARY_KEY, relativePath, input.buffer);

  const durationSec = await getAudioDurationMs(resolveProjectFilePath(BGM_LIBRARY_KEY, relativePath))
    .then((ms) => Math.round(ms / 1000))
    .catch(() => null);

  return prisma.bgmTrack.create({
    data: {
      youtubeId: null,
      title: input.title,
      category: input.category,
      durationSec,
      filePath: relativePath,
      source: "upload",
    },
  });
}

// soft delete: youtubeId를 남겨 재동기화 시 다시 받지 않도록 한다(사용자가 의도적으로 뺀 트랙).
export async function deleteBgmTrack(id: string) {
  const track = await prisma.bgmTrack.findUniqueOrThrow({ where: { id } });
  await fs.rm(resolveProjectFilePath(BGM_LIBRARY_KEY, track.filePath), { force: true });
  await prisma.bgmTrack.update({ where: { id }, data: { isActive: false } });
}

export function readBgmTrackFile(track: { filePath: string }) {
  return fs.readFile(resolveProjectFilePath(BGM_LIBRARY_KEY, track.filePath));
}

// 렌더링 파이프라인(video.service.ts)에서 BGM 트랙 원본 파일을 ffmpeg 입력으로 쓰기 위한 절대경로.
export function resolveBgmTrackPath(track: { filePath: string }): string {
  return resolveProjectFilePath(BGM_LIBRARY_KEY, track.filePath);
}

export type BgmSettings = {
  trackId: string;
  volumeDb: number;
  playbackSpeed: number;
  loop: boolean;
};

export async function getChannelBgmSettings(channelId: string): Promise<BgmSettings | null> {
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
  return (channel.defaultSettings as { bgm?: BgmSettings } | null)?.bgm ?? null;
}

export async function setChannelBgmSettings(channelId: string, bgm: BgmSettings | null) {
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: channelId } });
  const next: Record<string, unknown> = { ...(channel.defaultSettings as Record<string, unknown>) };
  if (bgm) next.bgm = bgm;
  else delete next.bgm;

  return prisma.channel.update({
    where: { id: channelId },
    data: { defaultSettings: next as Prisma.InputJsonValue },
  });
}

export async function getProjectBgmSettings(projectId: string): Promise<BgmSettings | null> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  return (project.settings as { bgm?: BgmSettings } | null)?.bgm ?? null;
}

export async function setProjectBgmSettings(projectId: string, bgm: BgmSettings | null) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const next: Record<string, unknown> = { ...(project.settings as Record<string, unknown>) };
  if (bgm) next.bgm = bgm;
  else delete next.bgm;

  return prisma.project.update({
    where: { id: projectId },
    data: { settings: next as Prisma.InputJsonValue },
  });
}

export type EffectiveBgmSettings = { settings: BgmSettings | null; scope: "project" | "channel" | null };

// 프로젝트 전용 설정이 있으면 그것을, 없으면 채널 기본값을 적용한다.
export async function getEffectiveBgmSettings(projectId: string): Promise<EffectiveBgmSettings> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { channel: true },
  });

  const projectBgm = (project.settings as { bgm?: BgmSettings } | null)?.bgm;
  if (projectBgm) return { settings: projectBgm, scope: "project" };

  const channelBgm = (project.channel.defaultSettings as { bgm?: BgmSettings } | null)?.bgm;
  if (channelBgm) return { settings: channelBgm, scope: "channel" };

  return { settings: null, scope: null };
}
