import { parseChannelInput } from "@/lib/channel-input";
import { analyzeChannelVideos, type ScannedVideo } from "@/lib/channel-scan";
import {
  getChannel,
  listChannelPlaylists,
  listPlaylistItems,
  listVideos,
  searchChannels,
  type YoutubeChannel,
} from "@/lib/clients/youtube";
import { scanPeriodCutoffMs, SCAN_PERIOD_DEFAULT, type ScanPeriod } from "@/lib/scan-period";

// UI_SPEC.md §7.1 "전수 스캔": 채널 규모에 따라 수 분 소요될 수 있어 상한을 둔다. 기간 드롭다운 도입 후
// 장기간·전체 선택 시 쿼터·시간 보호를 위해 최근 500개로 캡한다(그 안에서 기간 필터 적용).
const MAX_SCAN_VIDEOS = 500;
const VIDEOS_BATCH_SIZE = 50;

export async function resolveChannel(input: string): Promise<YoutubeChannel | null> {
  const parsed = parseChannelInput(input);

  if (parsed.type === "id") {
    const result = await getChannel({ id: parsed.value });
    return result.items[0] ?? null;
  }

  if (parsed.type === "handle") {
    const result = await getChannel({ forHandle: parsed.value });
    return result.items[0] ?? null;
  }

  const searchResult = await searchChannels(parsed.value);
  const channelId = searchResult.items[0]?.id?.channelId;
  if (!channelId) return null;

  const result = await getChannel({ id: channelId });
  return result.items[0] ?? null;
}

export type ChannelScanReport = {
  channel: YoutubeChannel;
  scannedCount: number;
  totalUploadCount: number;
  period: ScanPeriod;
  analysis: ReturnType<typeof analyzeChannelVideos>;
};

export async function scanChannel(input: string, period: ScanPeriod = SCAN_PERIOD_DEFAULT): Promise<ChannelScanReport> {
  const channel = await resolveChannel(input);
  if (!channel) {
    throw new Error("채널을 찾을 수 없습니다.");
  }

  const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
  const cutoffMs = scanPeriodCutoffMs(period);
  const videoIds: string[] = [];
  let pageToken: string | undefined;
  let reachedCutoff = false;

  // uploads 재생목록은 최신순이라, 컷오프보다 오래된 항목을 만나면 그 뒤는 모두 더 오래된 것이므로 멈춘다.
  do {
    const page = await listPlaylistItems(uploadsPlaylistId, pageToken);
    for (const item of page.items) {
      if (item.contentDetails.videoPublishedAt && new Date(item.contentDetails.videoPublishedAt).getTime() < cutoffMs) {
        reachedCutoff = true;
        break;
      }
      videoIds.push(item.contentDetails.videoId);
      if (videoIds.length >= MAX_SCAN_VIDEOS) break;
    }
    pageToken = page.nextPageToken;
  } while (pageToken && !reachedCutoff && videoIds.length < MAX_SCAN_VIDEOS);

  const trimmedIds = videoIds.slice(0, MAX_SCAN_VIDEOS);
  const scannedVideos: ScannedVideo[] = [];

  for (let i = 0; i < trimmedIds.length; i += VIDEOS_BATCH_SIZE) {
    const batch = trimmedIds.slice(i, i + VIDEOS_BATCH_SIZE);
    const videosResult = await listVideos(batch);
    scannedVideos.push(
      ...videosResult.items.map((v) => ({
        videoId: v.id,
        title: v.snippet.title,
        viewCount: Number(v.statistics.viewCount ?? 0),
        publishedAt: v.snippet.publishedAt,
        thumbnailUrl: v.snippet.thumbnails?.medium?.url,
      })),
    );
  }

  return {
    channel,
    scannedCount: trimmedIds.length,
    totalUploadCount: Number(channel.statistics.videoCount ?? 0),
    period,
    analysis: analyzeChannelVideos(scannedVideos),
  };
}

// featured 카테고리(재생목록 섹션) 재현: 채널이 만든 재생목록을 홈 화면처럼 카테고리 캐러셀로 보여준다.
// 쿼터·시간 보호를 위해 상위 재생목록 수와 재생목록당 영상 수에 상한을 둔다.
const MAX_SECTIONS = 12;
const VIDEOS_PER_SECTION = 12;

export type ChannelSection = {
  playlistId: string;
  title: string;
  itemCount: number;
  videos: ScannedVideo[];
};

export type ChannelSectionsReport = {
  channelId: string;
  sections: ChannelSection[];
};

export async function getChannelSections(channelId: string): Promise<ChannelSectionsReport> {
  const playlistPage = await listChannelPlaylists(channelId);
  const playlists = playlistPage.items.filter((p) => p.contentDetails.itemCount > 0).slice(0, MAX_SECTIONS);

  // 각 재생목록의 앞쪽 영상 ID를 모은다(재생목록 순서 보존).
  const perPlaylistVideoIds = new Map<string, string[]>();
  for (const playlist of playlists) {
    const items = await listPlaylistItems(playlist.id);
    perPlaylistVideoIds.set(
      playlist.id,
      items.items.map((i) => i.contentDetails.videoId).slice(0, VIDEOS_PER_SECTION),
    );
  }

  // 여러 재생목록에 겹쳐 나올 수 있으므로 videoId를 한 번에 모아 통계를 조회한다(dedupe).
  const uniqueIds = Array.from(new Set(Array.from(perPlaylistVideoIds.values()).flat()));
  const detailById = new Map<string, ScannedVideo>();
  for (let i = 0; i < uniqueIds.length; i += VIDEOS_BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + VIDEOS_BATCH_SIZE);
    if (batch.length === 0) continue;
    const videosResult = await listVideos(batch);
    for (const v of videosResult.items) {
      detailById.set(v.id, {
        videoId: v.id,
        title: v.snippet.title,
        viewCount: Number(v.statistics.viewCount ?? 0),
        publishedAt: v.snippet.publishedAt,
        thumbnailUrl: v.snippet.thumbnails?.medium?.url,
      });
    }
  }

  const sections: ChannelSection[] = playlists
    .map((playlist) => ({
      playlistId: playlist.id,
      title: playlist.snippet.title,
      itemCount: playlist.contentDetails.itemCount,
      videos: (perPlaylistVideoIds.get(playlist.id) ?? [])
        .map((id) => detailById.get(id))
        .filter((v): v is ScannedVideo => Boolean(v)),
    }))
    .filter((s) => s.videos.length > 0);

  return { channelId, sections };
}
