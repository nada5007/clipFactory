import { analyzeSurgePatterns, type SurgePatternAnalysis } from "@/lib/clients/anthropic";
import {
  listChannels,
  listPlaylistItems,
  listPopularVideos,
  listVideos,
  searchVideos,
  type YoutubeChannel,
  type YoutubeVideo,
} from "@/lib/clients/youtube";
import { cached } from "@/lib/cache";
import { median } from "@/lib/channel-scan";
import { parseIso8601DurationSeconds } from "@/lib/duration";
import { classifyVideoForm, type VideoForm } from "@/lib/explore-options";
import { expandKeywordTerms } from "@/lib/keyword-expansion";
import {
  surgePeriodToPublishedAfter,
  SURGE_DEFAULT_THRESHOLD,
  type SurgePeriod,
} from "@/lib/surge-options";
import {
  detectSurgedVideos,
  type ChannelBaseline,
  type HiddenGemFilter,
  type SurgeCandidateVideo,
  type SurgedVideo,
} from "@/lib/surge-detection";

const CANDIDATE_SAMPLE_SIZE = 50;
const BASELINE_SAMPLE_SIZE = 50;
const CATEGORY_CHANNEL_COUNT = 50;
const SEARCH_CACHE_TTL_SECONDS = 60 * 60;
const BASELINE_CACHE_TTL_SECONDS = 24 * 60 * 60;
const VIDEOS_BATCH_SIZE = 50; // videos.list의 id 파라미터는 최대 50개까지만 허용한다.

// youtube.ts 내부에 두면 같은 모듈 내부 호출이라 vi.mock으로 listVideos를 모킹해도 우회되므로
// (ESM에서 모듈 내부 함수 간 호출은 mock 오버라이드의 영향을 받지 않음) 이 서비스 파일에 둔다.
async function listVideosInBatches(videoIds: string[]): Promise<YoutubeVideo[]> {
  const results: YoutubeVideo[] = [];
  for (let i = 0; i < videoIds.length; i += VIDEOS_BATCH_SIZE) {
    const batch = await listVideos(videoIds.slice(i, i + VIDEOS_BATCH_SIZE));
    results.push(...batch.items);
  }
  return results;
}

export type SurgeMode = "keyword" | "category" | "channel";

export type SurgeSearchResult = {
  mode: SurgeMode;
  threshold: number;
  candidateCount: number;
  videos: SurgedVideo[];
};

function toCandidateVideos(videos: YoutubeVideo[]): SurgeCandidateVideo[] {
  return videos.map((v) => ({
    videoId: v.id,
    title: v.snippet.title,
    channelId: v.snippet.channelId,
    channelTitle: v.snippet.channelTitle,
    viewCount: Number(v.statistics.viewCount ?? 0),
    publishedAt: v.snippet.publishedAt,
    thumbnailUrl: v.snippet.thumbnails?.medium?.url,
    durationSeconds: v.contentDetails?.duration ? parseIso8601DurationSeconds(v.contentDetails.duration) : undefined,
  }));
}

function applyVideoForm(videos: SurgeCandidateVideo[], videoForm: VideoForm): SurgeCandidateVideo[] {
  if (videoForm === "all") return videos;
  return videos.filter((v) => classifyVideoForm(v.durationSeconds ?? 0) === videoForm);
}

type ChannelUploadsBaseline = ChannelBaseline & { recentVideos: SurgeCandidateVideo[] };

// UI_SPEC.md §7.1 "떡상 영상" 구현 노트: "자기 채널의 최근 업로드 50개 기준 median(baseline)"은 기간과 무관하게 안정적이다.
// 채널 단위·채널ID 모드는 이 동일한 최근 50개 표본을 기간 필터의 후보 풀로도 재사용해 채널당 search.list
// 호출(100 units)을 없앤다 — playlistItems.list(1 unit)만으로 baseline과 후보를 동시에 확보하는 절충 설계.
// (단, 매우 활발한 채널 + 매우 긴 기간 조합에서는 50개보다 오래된 업로드는 후보에서 누락될 수 있음)
async function fetchChannelUploadsBaseline(channel: YoutubeChannel): Promise<ChannelUploadsBaseline> {
  return cached(`surge-channel-uploads:${channel.id}`, BASELINE_CACHE_TTL_SECONDS, async () => {
    const uploadsPlaylistId = channel.contentDetails.relatedPlaylists.uploads;
    const page = await listPlaylistItems(uploadsPlaylistId);
    const recentVideoIds = page.items.slice(0, BASELINE_SAMPLE_SIZE).map((item) => item.contentDetails.videoId);

    if (recentVideoIds.length === 0) {
      return { channelId: channel.id, medianViewCount: 0, sampleSize: 0, recentVideos: [] };
    }

    const items = await listVideosInBatches(recentVideoIds);
    const recentVideos = toCandidateVideos(items);
    const viewCounts = recentVideos.map((v) => v.viewCount);
    return { channelId: channel.id, medianViewCount: median(viewCounts), sampleSize: viewCounts.length, recentVideos };
  });
}

function toFullBaseline(channel: YoutubeChannel, uploadsBaseline: ChannelUploadsBaseline): ChannelBaseline {
  return {
    channelId: uploadsBaseline.channelId,
    medianViewCount: uploadsBaseline.medianViewCount,
    sampleSize: uploadsBaseline.sampleSize,
    subscriberCount: Number(channel.statistics.subscriberCount ?? 0),
    hiddenSubscriberCount: Boolean(channel.statistics.hiddenSubscriberCount),
  };
}

function filterByPeriod(videos: SurgeCandidateVideo[], publishedAfter: string | undefined): SurgeCandidateVideo[] {
  if (!publishedAfter) return videos;
  return videos.filter((v) => v.publishedAt >= publishedAfter);
}

// 키워드 검색 기반 baseline 전용 조회 (영상 단위 모드용, recentVideos는 버림).
async function fetchChannelBaselines(channelIds: string[]): Promise<ChannelBaseline[]> {
  const baselines: ChannelBaseline[] = [];
  for (let i = 0; i < channelIds.length; i += 50) {
    const batch = channelIds.slice(i, i + 50);
    const channelsResult = await listChannels(batch);
    const batchBaselines = await Promise.all(
      channelsResult.items.map(async (c) => toFullBaseline(c, await fetchChannelUploadsBaseline(c))),
    );
    baselines.push(...batchBaselines);
  }
  return baselines;
}

// --- 모드 1: 영상 단위(키워드) — 기본 모드. UI_SPEC.md §7.1 "떡상 영상" ---

export type FindSurgedVideosParams = {
  keyword: string;
  regionCode?: string;
  categoryId?: string;
  videoForm?: VideoForm;
  period?: SurgePeriod;
  threshold?: number;
  hiddenGem?: HiddenGemFilter;
};

// PROJECT_SPEC.md §2.3 "떡상 영상 (2.9)": search.list(+자동 키워드 확장) → videos.list → 채널별 median → ratio 필터.
export async function findSurgedVideos(params: FindSurgedVideosParams): Promise<SurgeSearchResult> {
  const threshold = params.threshold ?? SURGE_DEFAULT_THRESHOLD;
  const period = params.period ?? "30d";
  const videoForm = params.videoForm ?? "all";
  const categoryId = params.categoryId && params.categoryId !== "ALL" ? params.categoryId : undefined;
  const publishedAfter = surgePeriodToPublishedAfter(period);

  const cacheKey = [
    "surge-keyword",
    params.keyword,
    params.regionCode ?? "",
    categoryId ?? "ALL",
    videoForm,
    period,
    threshold,
    params.hiddenGem?.enabled ?? false,
    params.hiddenGem?.subscriberCap ?? 0,
  ].join(":");

  return cached(cacheKey, SEARCH_CACHE_TTL_SECONDS, async () => {
    const terms = await expandKeywordTerms(params.keyword);
    const searchResults = await Promise.all(
      terms.map((term) =>
        searchVideos({
          q: term,
          regionCode: params.regionCode,
          videoCategoryId: categoryId,
          publishedAfter,
          maxResults: CANDIDATE_SAMPLE_SIZE,
        }),
      ),
    );
    const videoIds = Array.from(new Set(searchResults.flatMap((r) => r.items.map((item) => item.id.videoId))));

    if (videoIds.length === 0) {
      return { mode: "keyword", threshold, candidateCount: 0, videos: [] };
    }

    const videoItems = await listVideosInBatches(videoIds);
    const candidateVideos = applyVideoForm(toCandidateVideos(videoItems), videoForm);

    const channelIds = Array.from(new Set(candidateVideos.map((v) => v.channelId)));
    const baselines = await fetchChannelBaselines(channelIds);

    const videos = detectSurgedVideos(candidateVideos, baselines, threshold, params.hiddenGem);
    return { mode: "keyword", threshold, candidateCount: candidateVideos.length, videos };
  });
}

// --- 모드 2: 채널 단위(카테고리) — 신규. UI_SPEC.md §7.1 "떡상 영상" ---

export type FindSurgedVideosByCategoryParams = {
  regionCode?: string;
  categoryId?: string;
  seedKeyword?: string;
  videoForm?: VideoForm;
  period?: SurgePeriod;
  threshold?: number;
  hiddenGem?: HiddenGemFilter;
};

// 국가+카테고리(+선택적 시드 키워드)로 상위 50개 채널을 자동 선정 → 각 채널의 기간 내 떡상 영상을 통합 정렬.
// 시드 키워드 없으면 공식 인기 차트(mostPopular) 기반 상위 채널을 사용한다.
export async function findSurgedVideosByCategory(params: FindSurgedVideosByCategoryParams): Promise<SurgeSearchResult> {
  const threshold = params.threshold ?? SURGE_DEFAULT_THRESHOLD;
  const period = params.period ?? "7d";
  const videoForm = params.videoForm ?? "all";
  const categoryId = params.categoryId && params.categoryId !== "ALL" ? params.categoryId : undefined;
  const publishedAfter = surgePeriodToPublishedAfter(period);

  const cacheKey = [
    "surge-category",
    params.regionCode ?? "KR",
    categoryId ?? "ALL",
    params.seedKeyword ?? "",
    videoForm,
    period,
    threshold,
    params.hiddenGem?.enabled ?? false,
    params.hiddenGem?.subscriberCap ?? 0,
  ].join(":");

  return cached(cacheKey, SEARCH_CACHE_TTL_SECONDS, async () => {
    let channelIds: string[];

    if (params.seedKeyword) {
      const terms = await expandKeywordTerms(params.seedKeyword);
      const searchResults = await Promise.all(
        terms.map((term) =>
          searchVideos({
            q: term,
            regionCode: params.regionCode,
            videoCategoryId: categoryId,
            order: "viewCount",
            maxResults: 50,
          }),
        ),
      );
      channelIds = Array.from(new Set(searchResults.flatMap((r) => r.items.map((item) => item.snippet.channelId))))
        .slice(0, CATEGORY_CHANNEL_COUNT);
    } else {
      const popular = await listPopularVideos({ regionCode: params.regionCode, categoryId, maxResults: 50 });
      channelIds = Array.from(new Set(popular.items.map((v) => v.snippet.channelId))).slice(0, CATEGORY_CHANNEL_COUNT);
    }

    if (channelIds.length === 0) {
      return { mode: "category", threshold, candidateCount: 0, videos: [] };
    }

    const channelsResult = await listChannels(channelIds);
    const uploadsBaselines = await Promise.all(channelsResult.items.map((c) => fetchChannelUploadsBaseline(c)));

    const baselines: ChannelBaseline[] = [];
    let candidateVideos: SurgeCandidateVideo[] = [];
    channelsResult.items.forEach((channel, i) => {
      const uploadsBaseline = uploadsBaselines[i];
      baselines.push(toFullBaseline(channel, uploadsBaseline));
      candidateVideos.push(...filterByPeriod(uploadsBaseline.recentVideos, publishedAfter));
    });
    candidateVideos = applyVideoForm(candidateVideos, videoForm);

    const videos = detectSurgedVideos(candidateVideos, baselines, threshold, params.hiddenGem);
    return { mode: "category", threshold, candidateCount: candidateVideos.length, videos };
  });
}

// --- 모드 3: 채널 ID — 신규. UI_SPEC.md §7.1 "떡상 영상" ---

export type FindSurgedVideosForChannelParams = {
  channelId: string;
  videoForm?: VideoForm;
  period?: SurgePeriod;
  threshold?: number;
};

// 특정 채널의 UCxxx ID로 그 채널 최근 영상 중 떡상만 표시. 숨겨진 보석 모드 미지원(단일 채널이라 무의미).
export async function findSurgedVideosForChannel(params: FindSurgedVideosForChannelParams): Promise<SurgeSearchResult> {
  const threshold = params.threshold ?? SURGE_DEFAULT_THRESHOLD;
  const period = params.period ?? "all";
  const videoForm = params.videoForm ?? "all";
  const publishedAfter = surgePeriodToPublishedAfter(period);

  const cacheKey = ["surge-channel", params.channelId, videoForm, period, threshold].join(":");

  return cached(cacheKey, SEARCH_CACHE_TTL_SECONDS, async () => {
    const channelsResult = await listChannels([params.channelId]);
    const channel = channelsResult.items[0];
    if (!channel) {
      return { mode: "channel", threshold, candidateCount: 0, videos: [] };
    }

    const uploadsBaseline = await fetchChannelUploadsBaseline(channel);
    const baseline = toFullBaseline(channel, uploadsBaseline);
    const candidateVideos = applyVideoForm(filterByPeriod(uploadsBaseline.recentVideos, publishedAfter), videoForm);

    const videos = detectSurgedVideos(candidateVideos, [baseline], threshold);
    return { mode: "channel", threshold, candidateCount: candidateVideos.length, videos };
  });
}

// UI_SPEC.md §7.1 "떡상 영상" "[패턴 분석]" 버튼: 결과 상위 떡상 영상들의 공통 훅·업로드 시간대·길이·주제 추출.
export function analyzeSurgePatternsForVideos(videos: SurgedVideo[]): Promise<SurgePatternAnalysis> {
  return analyzeSurgePatterns(
    videos.map((v) => ({
      title: v.title,
      publishedAt: v.publishedAt,
      durationSeconds: v.durationSeconds ?? 0,
      ratio: v.ratio,
    })),
  );
}
