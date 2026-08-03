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
import { expandKeywordTerms, AUTO_EXPAND_RELATED_COUNT } from "@/lib/keyword-expansion";
import { getNicheKeywordEntry } from "@/lib/niche-keyword-map";
import {
  computeNewChannelShare,
  computeOpportunityScore,
  computeRecencyScore,
  type OpportunityScore,
} from "@/lib/opportunity-score";
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

const IDEA_MARKET_SAMPLE_SIZE = 25;
const NICHE_TOP_PERFORMER_SAMPLE_SIZE = 25;
const VPH_LOG_MAX = 4; // log10(10000): VPH(시간당 조회수) 1만이면 최상위(100점)로 본다.

// 정렬된 오름차순 배열에서 p 분위값(0~1)을 반환한다.
function percentileOfSorted(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.floor(sortedAsc.length * p))];
}

export type NicheTopPerformer = { niche: string; title: string; viewCount: number; vph: number };

// PROJECT_SPEC.md §2.3 "홈 (2.1) — 실제 성과를 니치 안에서 반영": 생성 그라운딩용. 니치를 실제로
// 검색해 지금 성과가 좋은(VPH 높은) 영상 상위 N개를 뽑아 LLM 프롬프트에 근거로 넣는다. 이러면
// 아이디어가 니치 안에서 실제 성과 데이터에 기반해 생성된다.
export async function getNicheTopPerformers(
  niche: string,
  count = 5,
  now: Date = new Date(),
): Promise<NicheTopPerformer[]> {
  const search = await searchVideos({ q: niche, regionCode: "KR", maxResults: NICHE_TOP_PERFORMER_SAMPLE_SIZE });
  const videoIds = Array.from(new Set(search.items.map((item) => item.id.videoId)));
  if (videoIds.length === 0) return [];

  const videos = await fetchVideosInBatches(videoIds);
  return videos
    .map((v) => {
      const viewCount = Number(v.statistics.viewCount ?? 0);
      return { niche, title: v.snippet.title, viewCount, vph: computeVph(viewCount, v.snippet.publishedAt, now) };
    })
    .sort((a, b) => b.vph - a.vph)
    .slice(0, count);
}

// PROJECT_SPEC.md §2.3 "홈 (2.1) — marketScore 변별력 개선": "오늘의 AI 아이디어"의 각 아이디어에 붙일
// "실제 성과 점수(marketScore, 0~100)"를 산출한다. 아이디어 자체는 존재하지 않는 기획이라 자체 조회수가
// 없으므로, 아이디어의 "고유 키워드"로 실제 영상을 검색해 그 주제 영상들의 VPH(시간당 조회수) 상위값을
// 프록시로 쓴다. 니치 접두어를 붙이지 않는 이유: 생성 단계에서 이미 니치 안으로 그라운딩되므로 니치를
// 앞세우면 같은 니치 아이디어들이 동일한 결과를 받아 점수 변별력이 죽는다(이전 방식의 문제). 비용은
// 아이디어당 검색 1회로 제한하고, VPH만 필요하므로 channels.list는 호출하지 않는다.
export async function computeIdeaMarketScore(keywords: string[], now: Date = new Date()): Promise<number> {
  const query = keywords.slice(0, 3).join(" ").trim();
  if (!query) return 0;

  const search = await searchVideos({ q: query, regionCode: "KR", maxResults: IDEA_MARKET_SAMPLE_SIZE });
  const videoIds = Array.from(new Set(search.items.map((item) => item.id.videoId)));
  if (videoIds.length === 0) return 0;

  const videos = await fetchVideosInBatches(videoIds);
  const vphsAsc = videos
    .map((v) => computeVph(Number(v.statistics.viewCount ?? 0), v.snippet.publishedAt, now))
    .sort((a, b) => a - b);

  // 주제의 "잘 나갈 때" 성과(75퍼센타일 VPH)를 로그 정규화해 0~100으로. 상위값을 쓰는 이유는 검색 결과에
  // 섞인 오래된 저성과 영상이 중앙값을 눌러 아이디어 간 차이를 지워버리는 것을 막기 위해서다.
  const topVph = percentileOfSorted(vphsAsc, 0.75);
  return Math.round(Math.min(1, Math.log10(topVph + 1) / VPH_LOG_MAX) * 100);
}

const KEYWORD_SEARCH_SAMPLE_SIZE = 50;
const MAX_BULK_KEYWORDS = 10;
const TOP_VIDEOS_DISPLAY_COUNT = 25;
const RELATED_TOPICS_SAMPLE_SIZE = 20;
const RELATED_TOPICS_COUNT = 10;

export type AnalyzedTopVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl?: string;
  viewCount: number;
  performanceTier: PerformanceTier;
  vph: number;
  estimatedRevenueKrw: number;
  channelSubscriberCount: number;
};

export type KeywordMarketAnalysis = KeywordScoreResult & {
  keyword: string;
  videos: YoutubeVideo[];
  topVideos: AnalyzedTopVideo[];
  opportunityScore: OpportunityScore;
  relatedTopics: TopicCount[];
};

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
    return {
      ...computeKeywordMarketScore([], []),
      keyword,
      videos: [],
      topVideos: [],
      opportunityScore: computeOpportunityScore({ popularity: 0, entryDifficulty: 0, newChannelShare: 0, recency: 0 }),
      relatedTopics: [],
    };
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

  // UI_SPEC.md §7.1 "탐색·분석" 분석 모드 "종합 기회 점수": 인기도+진입난이도+신생채널비중+최신성 가중합.
  const opportunityScore = computeOpportunityScore({
    popularity: result.searchVolumeScore,
    entryDifficulty: 100 - Math.round(result.competitionRatio * 100),
    newChannelShare: computeNewChannelShare(videos.map((v) => subscriberByChannelId.get(v.snippet.channelId) ?? 0)),
    recency: computeRecencyScore(videos.map((v) => v.snippet.publishedAt)),
  });

  const now = new Date();
  const topVideos: AnalyzedTopVideo[] = [...videos]
    .sort((a, b) => Number(b.statistics.viewCount ?? 0) - Number(a.statistics.viewCount ?? 0))
    .slice(0, TOP_VIDEOS_DISPLAY_COUNT)
    .map((v) => {
      const viewCount = Number(v.statistics.viewCount ?? 0);
      return {
        videoId: v.id,
        title: v.snippet.title,
        channelTitle: v.snippet.channelTitle,
        thumbnailUrl: v.snippet.thumbnails?.medium?.url,
        viewCount,
        performanceTier: computePerformanceTier(viewCount, v.snippet.publishedAt, now),
        vph: computeVph(viewCount, v.snippet.publishedAt, now),
        estimatedRevenueKrw: computeEstimatedRevenueKrw(viewCount, "ALL"),
        channelSubscriberCount: subscriberByChannelId.get(v.snippet.channelId) ?? 0,
      };
    });

  // UI_SPEC.md §7.1 "추천 키워드/태그": 상위 20개 영상의 제목+태그 빈도 분석(AI 호출 아님, 탐색 모드 "핵심 토픽"과 동일 로직).
  const topForTopics = [...videos]
    .sort((a, b) => Number(b.statistics.viewCount ?? 0) - Number(a.statistics.viewCount ?? 0))
    .slice(0, RELATED_TOPICS_SAMPLE_SIZE);
  const relatedTopics = extractTopTopics(
    topForTopics.map((v) => [v.snippet.title, ...(v.snippet.tags ?? [])].join(" ")),
    RELATED_TOPICS_COUNT,
  );

  return { ...result, keyword, videos, topVideos, opportunityScore, relatedTopics };
}

// UI_SPEC.md §7.1 "분석(analyze) 모드" "복수 키워드(bulk) 모드": 최대 10개 키워드를 한 번에 비교한다.
// 응답 크기를 통제하기 위해 videos 원본 목록은 생략하고 점수·통계만 반환한다.
export type BulkKeywordAnalysis = Omit<KeywordMarketAnalysis, "videos" | "topVideos" | "relatedTopics">;

export async function analyzeKeywordsBulk(
  keywords: string[],
  regionCode?: string,
): Promise<BulkKeywordAnalysis[]> {
  const trimmed = keywords.map((k) => k.trim()).filter(Boolean).slice(0, MAX_BULK_KEYWORDS);
  const results = await Promise.all(trimmed.map((k) => analyzeKeywordMarketability(k, regionCode)));
  return results.map(
    ({ score, breakdown, stats, searchVolumeScore, competitionRatio, recommendScore, opportunityScore, keyword }) => ({
      score,
      breakdown,
      stats,
      searchVolumeScore,
      competitionRatio,
      recommendScore,
      opportunityScore,
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
