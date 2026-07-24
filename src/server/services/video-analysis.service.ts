import { generateScriptPattern, generateVideoIdeas, type GeneratedScript, type GeneratedVideoIdeas } from "@/lib/clients/anthropic";
import { getChannel } from "@/lib/clients/youtube";
import { analyzeVideoSeo, type VideoSeoReport } from "@/server/services/video-seo.service";

export type VideoAnalysisChannelInfo = {
  title: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
};

export type VideoAnalysisDetail = VideoSeoReport & {
  channel: VideoAnalysisChannelInfo | null;
};

// PROJECT_SPEC.md §2.3 "영상 분석 모달 (2.10)": 개요/통계/댓글/SEO/유사영상/썸네일/채널정보 탭의 공통 데이터.
export async function getVideoAnalysisDetail(input: string): Promise<VideoAnalysisDetail> {
  const report = await analyzeVideoSeo(input);

  let channel: VideoAnalysisChannelInfo | null = null;
  try {
    const channelResult = await getChannel({ id: report.video.channelId });
    const channelItem = channelResult.items[0];
    if (channelItem) {
      channel = {
        title: channelItem.snippet.title,
        subscriberCount: Number(channelItem.statistics.subscriberCount ?? 0),
        videoCount: Number(channelItem.statistics.videoCount ?? 0),
        viewCount: Number(channelItem.statistics.viewCount ?? 0),
      };
    }
  } catch {
    channel = null;
  }

  return { ...report, channel };
}

// AI 아이디어 탭: lazy 실행(버튼 클릭 시에만 Anthropic API 호출). 이미 로드된 컨텍스트를 그대로 받아
// analyzeVideoSeo·댓글 감성 분석을 다시 호출(=Anthropic API 중복 과금)하지 않는다.
export function generateIdeasForVideo(input: {
  title: string;
  description: string;
  commentSummary?: string;
}): Promise<GeneratedVideoIdeas> {
  return generateVideoIdeas(input);
}

// UI_SPEC.md §7.1 "영상 카드 공통 버튼 4종" "[대본 패턴]": lazy 실행(버튼 클릭 시에만 Anthropic API 호출).
export function generateScriptPatternForVideo(input: { title: string; description: string }): Promise<GeneratedScript> {
  return generateScriptPattern(input);
}
