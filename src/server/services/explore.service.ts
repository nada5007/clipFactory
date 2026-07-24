import { generateRelatedKeywords } from "@/lib/clients/anthropic";
import { listChannels, listPopularVideos, listVideos, searchVideos, type YoutubeVideo } from "@/lib/clients/youtube";
import { cached } from "@/lib/cache";
import { parseIso8601DurationSeconds } from "@/lib/duration";
import {
  classifyVideoForm,
  minViewFilterToCount,
  periodToHours,
  PERFORMANCE_TIER_ORDER,
  type ExplorePeriod,
  type MinViewFilter,
  type PerformanceTier,
  type VideoForm,
} from "@/lib/explore-options";
import { computeEstimatedRevenueKrw, computePerformanceTier, computeVph } from "@/lib/performance-tier";
import { computeKeywordMarketScore, type KeywordScoreResult } from "@/lib/keyword-score";
import { getNicheKeywordEntry } from "@/lib/niche-keyword-map";
import { looksKorean } from "@/lib/source-discovery";
import { extractTopTopics, type TopicCount } from "@/lib/tf-idf";

const NICHE_VIDEO_COUNT = 5;

// UI_SPEC.md §7.1 "홈" "니치 인기" 위젯: 내 니치 카테고리의 "지금 뜨는 영상" 미리보기.
export async function getNichePopularVideos(niche: string) {
  const result = await searchVideos({ q: niche, regionCode: "KR", maxResults: NICHE_VIDEO_COUNT });
  if (result.items.length === 0) return [];

  const videosResult = await listVideos(result.items.map((item) => item.id.videoId));
  return videosResult.items;
}

const KEYWORD_SEARCH_SAMPLE_SIZE = 50;
const MAX_BULK_KEYWORDS = 10;
const AUTO_EXPAND_RELATED_COUNT = 3;

export type KeywordMarketAnalysis = KeywordScoreResult & { keyword: string; videos: YoutubeVideo[] };

// UI_SPEC.md §7.1 "탐색·분석" "자동 키워드 확장": 입력 키워드 → 연관 검색어 최대 3개 자동 생성 → 병렬 검색.
// ANTHROPIC_API_KEY 미설정 등으로 실패해도 원래 키워드만으로 계속 진행한다(보조 기능이므로 연성 실패 허용).
async function expandKeywordTerms(keyword: string): Promise<string[]> {
  try {
    const related = await generateRelatedKeywords(keyword, AUTO_EXPAND_RELATED_COUNT);
    return Array.from(new Set([keyword, ...related]));
  } catch {
    return [keyword];
  }
}

function dedupeVideosById(videos: YoutubeVideo[]): YoutubeVideo[] {
  const seen = new Map<string, YoutubeVideo>();
  for (const v of videos) {
    if (!seen.has(v.id)) seen.set(v.id, v);
  }
  return Array.from(seen.values());
}

const API_BATCH_SIZE = 50; // videos.list/channels.list는 id 파라미터에 최대 50개까지만 허용한다.

async function fetchVideosInBatches(videoIds: string[]): Promise<YoutubeVideo[]> {
  const results: YoutubeVideo[] = [];
  for (let i = 0; i < videoIds.length; i += API_BATCH_SIZE) {
    const batch = await listVideos(videoIds.slice(i, i + API_BATCH_SIZE));
    results.push(...batch.items);
  }
  return results;
}

async function fetchChannelSubscribersInBatches(channelIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (let i = 0; i < channelIds.length; i += API_BATCH_SIZE) {
    const batch = await listChannels(channelIds.slice(i, i + API_BATCH_SIZE));
    for (const c of batch.items) {
      map.set(c.id, Number(c.statistics.subscriberCount ?? 0));
    }
  }
  return map;
}

// UI_SPEC.md §7.1 "추천 키워드" 버튼: 자동 확장과 같은 생성기를 사용자에게 명시적으로 노출한다.
export function suggestRelatedKeywords(keyword: string): Promise<string[]> {
  return generateRelatedKeywords(keyword, AUTO_EXPAND_RELATED_COUNT);
}

// PROJECT_SPEC.md §2.3 "키워드 시장성 (2.4)": 검색 결과 상위 50개의 조회수/최신성/참여율/경쟁 채널 구독자 분포 종합.
export async function analyzeKeywordMarketability(
  keyword: string,
  regionCode?: string,
): Promise<KeywordMarketAnalysis> {
  const terms = await expandKeywordTerms(keyword);
  const searchResults = await Promise.all(
    terms.map((term) => searchVideos({ q: term, regionCode, maxResults: KEYWORD_SEARCH_SAMPLE_SIZE })),
  );
  const videoIds = Array.from(new Set(searchResults.flatMap((r) => r.items.map((item) => item.id.videoId))));

  if (videoIds.length === 0) {
    return { ...computeKeywordMarketScore([], []), keyword, videos: [] };
  }

  const videos = await fetchVideosInBatches(videoIds);
  const channelIds = Array.from(new Set(videos.map((v) => v.snippet.channelId)));
  const subscriberByChannelId = await fetchChannelSubscribersInBatches(channelIds);

  const scoreVideos = videos.map((v) => ({
    viewCount: Number(v.statistics.viewCount ?? 0),
    likeCount: Number(v.statistics.likeCount ?? 0),
    publishedAt: v.snippet.publishedAt,
    channelId: v.snippet.channelId,
  }));
  const scoreChannels = channelIds.map((id) => ({ id, subscriberCount: subscriberByChannelId.get(id) ?? 0 }));

  const result = computeKeywordMarketScore(scoreVideos, scoreChannels);
  return { ...result, keyword, videos };
}

// UI_SPEC.md §7.1 "분석(analyze) 모드" "복수 키워드(bulk) 모드": 최대 10개 키워드를 한 번에 비교한다.
// 응답 크기를 통제하기 위해 videos 원본 목록은 생략하고 점수·통계만 반환한다.
export type BulkKeywordAnalysis = Omit<KeywordMarketAnalysis, "videos">;

export async function analyzeKeywordsBulk(
  keywords: string[],
  regionCode?: string,
): Promise<BulkKeywordAnalysis[]> {
  const trimmed = keywords.map((k) => k.trim()).filter(Boolean).slice(0, MAX_BULK_KEYWORDS);
  const results = await Promise.all(trimmed.map((k) => analyzeKeywordMarketability(k, regionCode)));
  return results.map(
    ({ score, breakdown, stats, searchVolumeScore, competitionRatio, recommendScore, keyword }) => ({
      score,
      breakdown,
      stats,
      searchVolumeScore,
      competitionRatio,
      recommendScore,
      keyword,
    }),
  );
}

// --- browse(탐색) 모드: UI_SPEC.md §7.1 "탐색·분석" ---

export type BrowseVideosInput = {
  regionCode?: string;
  categoryId?: string; // "ALL" 또는 YouTube 표준 카테고리 ID
  period?: ExplorePeriod;
  query?: string;
  niche?: string; // 한국형 서브카테고리 칩 (NICHE_CATALOG 값)
  videoForm?: VideoForm;
  performanceTiers?: PerformanceTier[]; // 비어있으면 전체
  minViewFilter?: MinViewFilter;
  channelUniqueOnly?: boolean;
  krOnly?: boolean; // "한국어만 (KR 전용)" 체크박스, 기본 ON
};

export type BrowseVideoItem = YoutubeVideo & {
  vph: number;
  performanceTier: PerformanceTier;
  estimatedRevenueKrw: number;
};

export type BrowseVideosResult = {
  videos: BrowseVideoItem[];
  usedChart: boolean; // true = YouTube 공식 인기 차트(mostPopular) 경로 사용
  tierCounts: Record<PerformanceTier, number>; // 등급 필터 적용 "전"의 각 등급별 건수(칩에 표시)
  topTopics: TopicCount[];
};

const BROWSE_MAX_RESULTS = 100;
const CHART_FETCH_SIZE = 50; // videos.list(chart=mostPopular) 1회 호출 상한
const SEARCH_FETCH_SIZE_PER_QUERY = 50;
const BROWSE_CACHE_TTL_SECONDS = 60 * 60;

async function fetchBrowseCandidates(input: BrowseVideosInput): Promise<{ items: YoutubeVideo[]; usedChart: boolean }> {
  const period = input.period ?? "24h";
  const categoryId = input.categoryId && input.categoryId !== "ALL" ? input.categoryId : undefined;
  const nicheEntry = input.niche ? getNicheKeywordEntry(input.niche) : undefined;
  const explicitQuery = input.query?.trim();

  // API 매핑 규칙: 기간 24h + 쿼리 없음(니치 칩도 없음) = YouTube 공식 인기 차트. 그 외 = search.list.
  if (period === "24h" && !explicitQuery && !nicheEntry) {
    const result = await listPopularVideos({ regionCode: input.regionCode, categoryId, maxResults: CHART_FETCH_SIZE });
    return { items: result.items, usedChart: true };
  }

  const publishedAfter = new Date(Date.now() - periodToHours(period) * 60 * 60 * 1000).toISOString();

  let terms: string[];
  if (explicitQuery) {
    terms = await expandKeywordTerms(explicitQuery);
  } else if (nicheEntry) {
    terms = nicheEntry.keywords;
  } else {
    terms = [];
  }

  const searchCalls =
    terms.length > 0
      ? terms.map((term) =>
          searchVideos({
            q: term,
            regionCode: input.regionCode,
            videoCategoryId: categoryId,
            order: "viewCount",
            publishedAfter,
            maxResults: SEARCH_FETCH_SIZE_PER_QUERY,
          }),
        )
      : [
          searchVideos({
            regionCode: input.regionCode,
            videoCategoryId: categoryId,
            order: "viewCount",
            publishedAfter,
            maxResults: SEARCH_FETCH_SIZE_PER_QUERY,
          }),
        ];

  const searchResults = await Promise.all(searchCalls);
  const videoIds = Array.from(new Set(searchResults.flatMap((r) => r.items.map((item) => item.id.videoId))));
  if (videoIds.length === 0) return { items: [], usedChart: false };

  let items = dedupeVideosById(await fetchVideosInBatches(videoIds));

  // 한국형 서브카테고리 칩: 키워드 검색만으로는 부정확하므로 제목 매칭 필터로 정확도를 보강한다.
  if (nicheEntry) {
    items = items.filter((v) => nicheEntry.titlePattern.test(v.snippet.title));
  }

  return { items, usedChart: false };
}

export async function browseVideos(input: BrowseVideosInput): Promise<BrowseVideosResult> {
  const categoryId = input.categoryId && input.categoryId !== "ALL" ? input.categoryId : "ALL";
  const krOnly = input.krOnly ?? true;
  const videoForm = input.videoForm ?? "all";
  const minViewCount = minViewFilterToCount(input.minViewFilter ?? "all");
  const channelUniqueOnly = input.channelUniqueOnly ?? false;

  const cacheKey = [
    "explore-browse",
    input.regionCode ?? "KR",
    categoryId,
    input.period ?? "24h",
    input.query ?? "",
    input.niche ?? "",
    videoForm,
    krOnly,
    minViewCount,
    channelUniqueOnly,
    (input.performanceTiers ?? []).slice().sort().join(","),
  ].join(":");

  return cached(cacheKey, BROWSE_CACHE_TTL_SECONDS, async () => {
    const { items, usedChart } = await fetchBrowseCandidates(input);

    const now = new Date();
    let enriched: BrowseVideoItem[] = items.map((v) => {
      const viewCount = Number(v.statistics.viewCount ?? 0);
      return {
        ...v,
        vph: computeVph(viewCount, v.snippet.publishedAt, now),
        performanceTier: computePerformanceTier(viewCount, v.snippet.publishedAt, now),
        estimatedRevenueKrw: computeEstimatedRevenueKrw(viewCount, categoryId),
      };
    });

    if (krOnly) {
      enriched = enriched.filter((v) => looksKorean(v.snippet.title) || looksKorean(v.snippet.channelTitle));
    }

    if (videoForm !== "all") {
      enriched = enriched.filter((v) => {
        const duration = v.contentDetails?.duration;
        if (!duration) return videoForm === "long"; // 시그널 없음 = 롱폼으로 간주
        return classifyVideoForm(parseIso8601DurationSeconds(duration)) === videoForm;
      });
    }

    if (minViewCount > 0) {
      enriched = enriched.filter((v) => Number(v.statistics.viewCount ?? 0) >= minViewCount);
    }

    if (channelUniqueOnly) {
      const seenChannels = new Set<string>();
      enriched = enriched
        .sort((a, b) => Number(b.statistics.viewCount ?? 0) - Number(a.statistics.viewCount ?? 0))
        .filter((v) => {
          if (seenChannels.has(v.snippet.channelId)) return false;
          seenChannels.add(v.snippet.channelId);
          return true;
        });
    }

    const tierCounts = PERFORMANCE_TIER_ORDER.reduce(
      (acc, tier) => ({ ...acc, [tier]: enriched.filter((v) => v.performanceTier === tier).length }),
      {} as Record<PerformanceTier, number>,
    );

    if (input.performanceTiers && input.performanceTiers.length > 0) {
      const tierSet = new Set(input.performanceTiers);
      enriched = enriched.filter((v) => tierSet.has(v.performanceTier));
    }

    const sorted = enriched
      .sort((a, b) => Number(b.statistics.viewCount ?? 0) - Number(a.statistics.viewCount ?? 0))
      .slice(0, BROWSE_MAX_RESULTS);

    const topTopics = extractTopTopics(sorted.map((v) => v.snippet.title), 10);

    return { videos: sorted, usedChart, tierCounts, topTopics };
  });
}
