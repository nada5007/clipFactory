import { analyzeComments } from "@/lib/clients/anthropic";
import {
  getVideoDetail,
  listCommentThreads,
  listVideos,
  searchVideos,
  type YoutubeVideo,
} from "@/lib/clients/youtube";
import { type Chapter, parseChapters } from "@/lib/chapters";
import { buildCommentInsightSummary, type ClassifiedComment, type CommentInsightSummary } from "@/lib/comment-insight";
import { parseIso8601DurationSeconds } from "@/lib/duration";
import { classifyVideoForm } from "@/lib/explore-options";
import { computeEstimatedRevenueKrw, computePerformanceTier, computeVph } from "@/lib/performance-tier";
import { computeGeneralSeoScore, computeKeywordSeoScore, type SeoScoreResult } from "@/lib/seo-score";
import { parseVideoId } from "@/lib/video-id";

const SIMILAR_VIDEO_COUNT = 40;
const SAME_CHANNEL_VIDEO_COUNT = 20;

export type CommentInsight = {
  summary: string | null;
  frequentQuestions: string[];
  insight: CommentInsightSummary | null;
  sampleSize: number;
  error?: string;
};

export type RelatedVideoSummary = { id: string; title: string; channelTitle: string; viewCount: number };

export type VideoSeoReport = {
  video: {
    id: string;
    title: string;
    channelId: string;
    channelTitle: string;
    description: string;
    tags: string[];
    thumbnailUrl?: string;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    duration: string;
    publishedAt: string;
    categoryId?: string;
    isShort: boolean;
  };
  seo: SeoScoreResult;
  comments: CommentInsight;
  performance: { vph: number; tier: ReturnType<typeof computePerformanceTier>; estimatedRevenueKrw: number };
  chapters: Chapter[];
  similarVideos: RelatedVideoSummary[];
  similarVideosSearchTerm: string;
  sameChannelVideos: RelatedVideoSummary[];
};

async function collectCommentInsight(videoId: string): Promise<CommentInsight> {
  try {
    const commentsResult = await listCommentThreads(videoId, 100);
    const raw = commentsResult.items
      .map((c) => ({
        text: c.snippet.topLevelComment.snippet.textDisplay,
        author: c.snippet.topLevelComment.snippet.authorDisplayName,
        likeCount: c.snippet.topLevelComment.snippet.likeCount,
        replyCount: c.snippet.totalReplyCount ?? 0,
      }))
      .filter((c): c is typeof c & { text: string } => Boolean(c.text));

    if (raw.length === 0) {
      return { summary: null, frequentQuestions: [], insight: null, sampleSize: 0 };
    }

    const analysis = await analyzeComments(raw.map((r) => r.text));
    const classificationByIndex = new Map(analysis.classifications.map((c) => [c.index, c]));
    const classified: ClassifiedComment[] = raw.map((r, i) => ({
      ...r,
      sentiment: classificationByIndex.get(i)?.sentiment ?? "neutral",
      intent: classificationByIndex.get(i)?.intent ?? "기타",
    }));

    return {
      summary: analysis.summary,
      frequentQuestions: analysis.frequentQuestions,
      insight: buildCommentInsightSummary(classified),
      sampleSize: raw.length,
    };
  } catch (error) {
    return {
      summary: null,
      frequentQuestions: [],
      insight: null,
      sampleSize: 0,
      error: error instanceof Error ? error.message : "댓글 분석에 실패했습니다.",
    };
  }
}

function toRelatedVideoSummaries(videos: YoutubeVideo[], order: string[]): RelatedVideoSummary[] {
  const byId = new Map(videos.map((v) => [v.id, v]));
  return order
    .map((id) => byId.get(id))
    .filter((v): v is YoutubeVideo => Boolean(v))
    .map((v) => ({
      id: v.id,
      title: v.snippet.title,
      channelTitle: v.snippet.channelTitle,
      viewCount: Number(v.statistics.viewCount ?? 0),
    }));
}

// PROJECT_SPEC.md §2.3 "영상 SEO 진단": 제목/설명/태그 SEO 진단 + 댓글 수집·감성 분류(AI) + 관련 영상 리스트.
export async function analyzeVideoSeo(input: string, targetKeyword?: string): Promise<VideoSeoReport> {
  const videoId = parseVideoId(input);
  if (!videoId) {
    throw new Error("올바른 YouTube 영상 URL 또는 ID를 입력하세요.");
  }

  const videoResult = await getVideoDetail(videoId);
  const video = videoResult.items[0];
  if (!video) {
    throw new Error("영상을 찾을 수 없습니다.");
  }

  const seoInput = {
    title: video.snippet.title,
    description: video.snippet.description,
    tags: video.snippet.tags ?? [],
    hasMaxResThumbnail: Boolean(video.snippet.thumbnails?.maxres),
  };
  const seo = targetKeyword ? computeKeywordSeoScore(seoInput, targetKeyword) : computeGeneralSeoScore(seoInput);

  const comments = await collectCommentInsight(videoId);

  const viewCount = Number(video.statistics.viewCount ?? 0);
  const categoryId = video.snippet.categoryId ?? "ALL";
  const performance = {
    vph: computeVph(viewCount, video.snippet.publishedAt),
    tier: computePerformanceTier(viewCount, video.snippet.publishedAt),
    estimatedRevenueKrw: computeEstimatedRevenueKrw(viewCount, categoryId),
  };
  const chapters = parseChapters(video.snippet.description);
  const isShort = classifyVideoForm(parseIso8601DurationSeconds(video.contentDetails.duration)) === "short";

  const [similarSearchResult, sameChannelSearchResult] = await Promise.all([
    searchVideos({ q: video.snippet.title, maxResults: SIMILAR_VIDEO_COUNT + 1 }),
    searchVideos({ channelId: video.snippet.channelId, order: "viewCount", maxResults: SAME_CHANNEL_VIDEO_COUNT + 1 }),
  ]);

  const similarIds = similarSearchResult.items.map((item) => item.id.videoId).filter((id) => id !== videoId).slice(0, SIMILAR_VIDEO_COUNT);
  const sameChannelIds = sameChannelSearchResult.items
    .map((item) => item.id.videoId)
    .filter((id) => id !== videoId)
    .slice(0, SAME_CHANNEL_VIDEO_COUNT);

  const allIds = Array.from(new Set([...similarIds, ...sameChannelIds]));
  const relatedVideos: YoutubeVideo[] = [];
  const VIDEOS_BATCH_SIZE = 50; // videos.list의 id 파라미터는 최대 50개까지만 허용한다.
  for (let i = 0; i < allIds.length; i += VIDEOS_BATCH_SIZE) {
    const batch = await listVideos(allIds.slice(i, i + VIDEOS_BATCH_SIZE));
    relatedVideos.push(...batch.items);
  }

  return {
    video: {
      id: video.id,
      title: video.snippet.title,
      channelId: video.snippet.channelId,
      channelTitle: video.snippet.channelTitle,
      description: video.snippet.description,
      tags: video.snippet.tags ?? [],
      thumbnailUrl: video.snippet.thumbnails?.maxres?.url ?? video.snippet.thumbnails?.medium?.url,
      viewCount,
      likeCount: Number(video.statistics.likeCount ?? 0),
      commentCount: Number(video.statistics.commentCount ?? 0),
      duration: video.contentDetails.duration,
      publishedAt: video.snippet.publishedAt,
      categoryId: video.snippet.categoryId,
      isShort,
    },
    seo,
    comments,
    performance,
    chapters,
    similarVideos: toRelatedVideoSummaries(relatedVideos, similarIds),
    similarVideosSearchTerm: video.snippet.title,
    sameChannelVideos: toRelatedVideoSummaries(relatedVideos, sameChannelIds),
  };
}
