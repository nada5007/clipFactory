import { parseChannelInput } from "@/lib/channel-input";
import { analyzeChannelVideos, type ScannedVideo } from "@/lib/channel-scan";
import { getChannel, listPlaylistItems, listVideos, searchChannels, type YoutubeChannel } from "@/lib/clients/youtube";
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
      if (cutoffMs !== null && item.contentDetails.videoPublishedAt) {
        if (new Date(item.contentDetails.videoPublishedAt).getTime() < cutoffMs) {
          reachedCutoff = true;
          break;
        }
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
