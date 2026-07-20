import { listChannels, listPopularVideos, listVideos, searchVideos, type YoutubeVideo } from "@/lib/clients/youtube";
import { computeKeywordMarketScore, type KeywordScoreResult } from "@/lib/keyword-score";

export function getPopularVideos(regionCode?: string, categoryId?: string) {
  return listPopularVideos({ regionCode, categoryId });
}

const KEYWORD_SEARCH_SAMPLE_SIZE = 50;

export type KeywordMarketAnalysis = KeywordScoreResult & { keyword: string; videos: YoutubeVideo[] };

// PROJECT_SPEC.md §2.3 "키워드 시장성 (2.4)": 검색 결과 상위 50개의 조회수/최신성/참여율/경쟁 채널 구독자 분포 종합.
export async function analyzeKeywordMarketability(
  keyword: string,
  regionCode?: string,
): Promise<KeywordMarketAnalysis> {
  const searchResult = await searchVideos({ q: keyword, regionCode, maxResults: KEYWORD_SEARCH_SAMPLE_SIZE });
  const videoIds = searchResult.items.map((item) => item.id.videoId);

  if (videoIds.length === 0) {
    return { ...computeKeywordMarketScore([], []), keyword, videos: [] };
  }

  const videosResult = await listVideos(videoIds);
  const channelIds = Array.from(new Set(videosResult.items.map((v) => v.snippet.channelId)));
  const channelsResult = await listChannels(channelIds);
  const subscriberByChannelId = new Map(
    channelsResult.items.map((c) => [c.id, Number(c.statistics.subscriberCount ?? 0)]),
  );

  const scoreVideos = videosResult.items.map((v) => ({
    viewCount: Number(v.statistics.viewCount ?? 0),
    likeCount: Number(v.statistics.likeCount ?? 0),
    publishedAt: v.snippet.publishedAt,
    channelId: v.snippet.channelId,
  }));
  const scoreChannels = channelIds.map((id) => ({ id, subscriberCount: subscriberByChannelId.get(id) ?? 0 }));

  const result = computeKeywordMarketScore(scoreVideos, scoreChannels);
  return { ...result, keyword, videos: videosResult.items };
}
