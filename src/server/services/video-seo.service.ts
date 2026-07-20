import { analyzeComments, type CommentAnalysis } from "@/lib/clients/anthropic";
import { getVideoDetail, listCommentThreads, searchVideos, type YoutubeSearchItem } from "@/lib/clients/youtube";
import { computeGeneralSeoScore, computeKeywordSeoScore, type SeoScoreResult } from "@/lib/seo-score";
import { parseVideoId } from "@/lib/video-id";

const SIMILAR_VIDEO_COUNT = 10;

export type CommentInsight = {
  analysis: CommentAnalysis | null;
  sampleSize: number;
  error?: string;
};

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
  };
  seo: SeoScoreResult;
  comments: CommentInsight;
  similarVideos: YoutubeSearchItem[];
};

async function collectCommentInsight(videoId: string): Promise<CommentInsight> {
  try {
    const commentsResult = await listCommentThreads(videoId, 100);
    const texts = commentsResult.items
      .map((c) => c.snippet.topLevelComment.snippet.textDisplay)
      .filter((text): text is string => Boolean(text));

    if (texts.length === 0) {
      return { analysis: null, sampleSize: 0 };
    }

    const analysis = await analyzeComments(texts);
    return { analysis, sampleSize: texts.length };
  } catch (error) {
    return {
      analysis: null,
      sampleSize: 0,
      error: error instanceof Error ? error.message : "댓글 분석에 실패했습니다.",
    };
  }
}

// PROJECT_SPEC.md §2.3 "영상 SEO 진단": 제목/설명/태그 SEO 진단 + 댓글 수집·감성 요약(AI) + 유사 영상 리스트.
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

  const similarSearchResult = await searchVideos({ q: video.snippet.title, maxResults: SIMILAR_VIDEO_COUNT + 1 });
  const similarVideos = similarSearchResult.items
    .filter((item) => item.id.videoId !== videoId)
    .slice(0, SIMILAR_VIDEO_COUNT);

  return {
    video: {
      id: video.id,
      title: video.snippet.title,
      channelId: video.snippet.channelId,
      channelTitle: video.snippet.channelTitle,
      description: video.snippet.description,
      tags: video.snippet.tags ?? [],
      thumbnailUrl: video.snippet.thumbnails?.maxres?.url ?? video.snippet.thumbnails?.medium?.url,
      viewCount: Number(video.statistics.viewCount ?? 0),
      likeCount: Number(video.statistics.likeCount ?? 0),
      commentCount: Number(video.statistics.commentCount ?? 0),
      duration: video.contentDetails.duration,
    },
    seo,
    comments,
    similarVideos,
  };
}
