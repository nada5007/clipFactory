import { median } from "@/lib/channel-scan";
import { listChannels, listPlaylistItems, listVideos, searchVideos } from "@/lib/clients/youtube";
import { detectSurgedVideos, type ChannelBaseline, type SurgeCandidateVideo, type SurgedVideo } from "@/lib/surge-detection";

const CANDIDATE_SAMPLE_SIZE = 50;
const BASELINE_SAMPLE_SIZE = 50;
export const DEFAULT_SURGE_THRESHOLD = 5;

export type SurgeSearchResult = {
  keyword: string;
  threshold: number;
  candidateCount: number;
  videos: SurgedVideo[];
};

// PROJECT_SPEC.md §2.3 "떡상 영상 (2.9)": search.list → videos.list → 채널별 최근 업로드 median → ratio 필터.
export async function findSurgedVideos(params: {
  keyword: string;
  regionCode?: string;
  publishedAfter?: string;
  threshold?: number;
}): Promise<SurgeSearchResult> {
  const threshold = params.threshold ?? DEFAULT_SURGE_THRESHOLD;

  const searchResult = await searchVideos({
    q: params.keyword,
    regionCode: params.regionCode,
    publishedAfter: params.publishedAfter,
    maxResults: CANDIDATE_SAMPLE_SIZE,
  });
  const videoIds = searchResult.items.map((item) => item.id.videoId);

  if (videoIds.length === 0) {
    return { keyword: params.keyword, threshold, candidateCount: 0, videos: [] };
  }

  const videosResult = await listVideos(videoIds);
  const candidateVideos: SurgeCandidateVideo[] = videosResult.items.map((v) => ({
    videoId: v.id,
    title: v.snippet.title,
    channelId: v.snippet.channelId,
    channelTitle: v.snippet.channelTitle,
    viewCount: Number(v.statistics.viewCount ?? 0),
    publishedAt: v.snippet.publishedAt,
    thumbnailUrl: v.snippet.thumbnails?.medium?.url,
  }));

  const channelIds = Array.from(new Set(candidateVideos.map((v) => v.channelId)));
  const channelsResult = await listChannels(channelIds);
  const uploadsPlaylistByChannel = new Map(
    channelsResult.items.map((c) => [c.id, c.contentDetails.relatedPlaylists.uploads]),
  );

  const baselines: ChannelBaseline[] = [];
  for (const channelId of channelIds) {
    const uploadsPlaylistId = uploadsPlaylistByChannel.get(channelId);
    if (!uploadsPlaylistId) {
      baselines.push({ channelId, medianViewCount: 0, sampleSize: 0 });
      continue;
    }

    const page = await listPlaylistItems(uploadsPlaylistId);
    const recentVideoIds = page.items.slice(0, BASELINE_SAMPLE_SIZE).map((item) => item.contentDetails.videoId);
    if (recentVideoIds.length === 0) {
      baselines.push({ channelId, medianViewCount: 0, sampleSize: 0 });
      continue;
    }

    const recentVideosResult = await listVideos(recentVideoIds);
    const viewCounts = recentVideosResult.items.map((v) => Number(v.statistics.viewCount ?? 0));
    baselines.push({ channelId, medianViewCount: median(viewCounts), sampleSize: viewCounts.length });
  }

  const videos = detectSurgedVideos(candidateVideos, baselines, threshold);

  return { keyword: params.keyword, threshold, candidateCount: candidateVideos.length, videos };
}
