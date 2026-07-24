import { scoreSourceMatches, translateTitles } from "@/lib/clients/anthropic";
import { cached } from "@/lib/cache";
import {
  listVideos,
  searchVideos,
  type YoutubeSearchResponse,
  type YoutubeVideo,
} from "@/lib/clients/youtube";
import { resolveDateRange } from "@/lib/date-range";
import { parseIso8601DurationSeconds } from "@/lib/duration";
import { filterKoreanContent } from "@/lib/source-discovery";
import type { DateRangeFilter, LengthFilter, MinViewFilter, SortOption } from "@/lib/source-discovery-options";

const SAMPLE_SIZE_PER_CALL = 50;
const VIDEOS_BATCH_SIZE = 50;
// LLM 매치 채점 비용·지연 시간을 통제하기 위해 다중 지역·언어로 후보가 많아져도 상위 N개까지만 채점한다.
const MAX_SCORE_CANDIDATES = 100;
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const SHORTS_FIT_THRESHOLD_SECONDS = 180;

const LENGTH_TO_API_PARAM: Record<LengthFilter, "short" | "medium" | "long" | undefined> = {
  ALL: undefined,
  SHORT: "short",
  MEDIUM_LONG: "medium",
  LONG: "long",
};

export type SourceDiscoveryVideo = YoutubeVideo & {
  matchScore: number;
  matchReason: string;
  matchedKeywords: string[];
  translatedTitle?: string;
};

export type SourceDiscoveryResult = {
  concept: string;
  candidateCount: number;
  videos: SourceDiscoveryVideo[];
};

export type DiscoverSourcesInput = {
  concept: string;
  regionCodes?: string[];
  languages?: string[];
  excludeKorean?: boolean;
  length?: LengthFilter;
  dateRange?: DateRangeFilter;
  minViewCount?: MinViewFilter;
  sort?: SortOption;
  translateTitles?: boolean;
};

function dedupeById(items: YoutubeVideo[]): YoutubeVideo[] {
  const seen = new Map<string, YoutubeVideo>();
  for (const item of items) {
    if (!seen.has(item.id)) seen.set(item.id, item);
  }
  return Array.from(seen.values());
}

async function fetchCandidateVideoIds(
  concept: string,
  regionCodes: string[],
  languages: string[],
  videoDuration: "short" | "medium" | "long" | undefined,
  publishedAfter: string | undefined,
  publishedBefore: string | undefined,
): Promise<string[]> {
  const baseParams = { q: concept, maxResults: SAMPLE_SIZE_PER_CALL, videoDuration, publishedAfter, publishedBefore };
  const searchCalls: Promise<YoutubeSearchResponse>[] = [];

  if (regionCodes.length === 0 && languages.length === 0) {
    searchCalls.push(searchVideos(baseParams));
  } else {
    for (const regionCode of regionCodes) {
      searchCalls.push(searchVideos({ ...baseParams, regionCode }));
    }
    for (const relevanceLanguage of languages) {
      searchCalls.push(searchVideos({ ...baseParams, relevanceLanguage }));
    }
  }

  const searchResults = await Promise.all(searchCalls);
  const ids = searchResults.flatMap((r) => r.items.map((item) => item.id.videoId));
  return Array.from(new Set(ids));
}

async function fetchVideosByIds(videoIds: string[]): Promise<YoutubeVideo[]> {
  const results: YoutubeVideo[] = [];
  for (let i = 0; i < videoIds.length; i += VIDEOS_BATCH_SIZE) {
    const batch = videoIds.slice(i, i + VIDEOS_BATCH_SIZE);
    const videosResult = await listVideos(batch);
    results.push(...videosResult.items);
  }
  return dedupeById(results);
}

function applySort(videos: SourceDiscoveryVideo[], sort: SortOption): SourceDiscoveryVideo[] {
  const withDuration = (v: SourceDiscoveryVideo) =>
    v.contentDetails?.duration ? parseIso8601DurationSeconds(v.contentDetails.duration) : Infinity;
  const viewsOf = (v: SourceDiscoveryVideo) => Number(v.statistics.viewCount ?? 0);

  const sorted = [...videos];
  switch (sort) {
    case "VIEWS":
      return sorted.sort((a, b) => viewsOf(b) - viewsOf(a));
    case "LATEST":
      return sorted.sort((a, b) => new Date(b.snippet.publishedAt).getTime() - new Date(a.snippet.publishedAt).getTime());
    case "SHORTS_FIT":
      return sorted.sort((a, b) => {
        const aFit = withDuration(a) <= SHORTS_FIT_THRESHOLD_SECONDS ? 1 : 0;
        const bFit = withDuration(b) <= SHORTS_FIT_THRESHOLD_SECONDS ? 1 : 0;
        return bFit - aFit || b.matchScore - a.matchScore;
      });
    case "MATCH":
    default:
      return sorted.sort((a, b) => b.matchScore - a.matchScore || viewsOf(b) - viewsOf(a));
  }
}

// PROJECT_SPEC.md §2.3 "소스 발굴 (2.2) — UI 확장 요구사항": 다중 지역·언어는 각각 병렬 검색 후 병합한다.
export async function discoverSources(input: DiscoverSourcesInput): Promise<SourceDiscoveryResult> {
  const excludeKorean = input.excludeKorean ?? true;
  const regionCodes = input.regionCodes ?? [];
  const languages = input.languages ?? [];
  const length = input.length ?? "ALL";
  const dateRange = input.dateRange ?? "ALL";
  const minViewCount = input.minViewCount ?? 0;
  const sort = input.sort ?? "MATCH";
  const translate = input.translateTitles ?? false;

  const cacheKey = [
    "source-discovery",
    input.concept,
    regionCodes.slice().sort().join(","),
    languages.slice().sort().join(","),
    excludeKorean,
    length,
    dateRange,
    minViewCount,
    sort,
    translate,
  ].join(":");

  return cached(cacheKey, CACHE_TTL_SECONDS, async () => {
    const { publishedAfter, publishedBefore } = resolveDateRange(dateRange);
    const videoDuration = LENGTH_TO_API_PARAM[length];

    const videoIds = await fetchCandidateVideoIds(
      input.concept,
      regionCodes,
      languages,
      videoDuration,
      publishedAfter,
      publishedBefore,
    );

    if (videoIds.length === 0) {
      return { concept: input.concept, candidateCount: 0, videos: [] };
    }

    const fetchedVideos = await fetchVideosByIds(videoIds);

    const koreanFiltered = filterKoreanContent(
      fetchedVideos.map((v) => ({ ...v, title: v.snippet.title, channelTitle: v.snippet.channelTitle })),
      excludeKorean,
    );

    const viewFiltered = koreanFiltered.filter((v) => Number(v.statistics.viewCount ?? 0) >= minViewCount);

    if (viewFiltered.length === 0) {
      return { concept: input.concept, candidateCount: 0, videos: [] };
    }

    const capped = [...viewFiltered]
      .sort((a, b) => Number(b.statistics.viewCount ?? 0) - Number(a.statistics.viewCount ?? 0))
      .slice(0, MAX_SCORE_CANDIDATES);

    const matches = await scoreSourceMatches(
      input.concept,
      capped.map((v) => ({
        title: v.snippet.title,
        description: v.snippet.description ?? "",
        channelTitle: v.snippet.channelTitle,
      })),
    );
    const matchByIndex = new Map(matches.map((m) => [m.index, m]));

    let videos: SourceDiscoveryVideo[] = capped.map((v, i) => {
      const match = matchByIndex.get(i);
      return {
        ...v,
        matchScore: match?.score ?? 0,
        matchReason: match?.reason ?? "",
        matchedKeywords: match?.matchedKeywords ?? [],
      };
    });

    videos = applySort(videos, sort);

    if (translate) {
      const translated = await translateTitles(videos.map((v) => v.snippet.title));
      videos = videos.map((v, i) => ({ ...v, translatedTitle: translated[i] }));
    }

    return { concept: input.concept, candidateCount: videos.length, videos };
  });
}
