import { scoreSourceMatches } from "@/lib/clients/anthropic";
import { cached } from "@/lib/cache";
import { listVideos, searchVideos, type YoutubeVideo } from "@/lib/clients/youtube";
import { filterKoreanContent } from "@/lib/source-discovery";

const SAMPLE_SIZE = 50;
const CACHE_TTL_SECONDS = 24 * 60 * 60;

export type SourceDiscoveryVideo = YoutubeVideo & {
  matchScore: number;
  matchReason: string;
  matchedKeywords: string[];
};

export type SourceDiscoveryResult = {
  concept: string;
  candidateCount: number;
  videos: SourceDiscoveryVideo[];
};

// PROJECT_SPEC.md §2.2 "소스 발굴": 해외 YouTube 검색 + 컨셉 매치 점수. 동일 컨셉·옵션 조합은 24시간 캐시.
export async function discoverSources(input: {
  concept: string;
  regionCode?: string;
  excludeKorean?: boolean;
}): Promise<SourceDiscoveryResult> {
  const excludeKorean = input.excludeKorean ?? true;
  const cacheKey = `source-discovery:${input.concept}:${input.regionCode ?? ""}:${excludeKorean}`;

  return cached(cacheKey, CACHE_TTL_SECONDS, async () => {
    const searchResult = await searchVideos({ q: input.concept, regionCode: input.regionCode, maxResults: SAMPLE_SIZE });
    const videoIds = searchResult.items.map((item) => item.id.videoId);

    if (videoIds.length === 0) {
      return { concept: input.concept, candidateCount: 0, videos: [] };
    }

    const videosResult = await listVideos(videoIds);
    const filtered = filterKoreanContent(
      videosResult.items.map((v) => ({ ...v, title: v.snippet.title, channelTitle: v.snippet.channelTitle })),
      excludeKorean,
    );

    if (filtered.length === 0) {
      return { concept: input.concept, candidateCount: 0, videos: [] };
    }

    const matches = await scoreSourceMatches(
      input.concept,
      filtered.map((v) => ({
        title: v.snippet.title,
        description: v.snippet.description ?? "",
        channelTitle: v.snippet.channelTitle,
      })),
    );
    const matchByIndex = new Map(matches.map((m) => [m.index, m]));

    const videos: SourceDiscoveryVideo[] = filtered.map((v, i) => {
      const match = matchByIndex.get(i);
      return {
        ...v,
        matchScore: match?.score ?? 0,
        matchReason: match?.reason ?? "",
        matchedKeywords: match?.matchedKeywords ?? [],
      };
    });
    videos.sort((a, b) => b.matchScore - a.matchScore);

    return { concept: input.concept, candidateCount: videos.length, videos };
  });
}
