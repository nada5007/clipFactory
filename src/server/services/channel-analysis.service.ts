import { parseChannelInput } from "@/lib/channel-input";
import { analyzeChannelVideos, type ScannedVideo } from "@/lib/channel-scan";
import { getChannel, listPlaylistItems, listVideos, searchChannels, type YoutubeChannel } from "@/lib/clients/youtube";

// UI_SPEC.md §7.1 "전수 스캔": 채널 규모에 따라 수 분 소요될 수 있어 v1에서는 최근 200개로 상한을 둔다.
const MAX_SCAN_VIDEOS = 200;
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
  analysis: ReturnType<typeof analyzeChannelVideos>;
};

export async function scanChannel(input: string): Promise<ChannelScanReport> {
  const channel = await resolveChannel(input);
  if (!channel) {
    throw new Error("채널을 찾을 수 없습니다.");
  }

  const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
  const videoIds: string[] = [];
  let pageToken: string | undefined;

  do {
    const page = await listPlaylistItems(uploadsPlaylistId, pageToken);
    videoIds.push(...page.items.map((item) => item.contentDetails.videoId));
    pageToken = page.nextPageToken;
  } while (pageToken && videoIds.length < MAX_SCAN_VIDEOS);

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
    analysis: analyzeChannelVideos(scannedVideos),
  };
}
