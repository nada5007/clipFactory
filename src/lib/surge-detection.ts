// PROJECT_SPEC.md §2.3 "떡상 영상 (2.9)" + UI_SPEC.md §7.1 "떡상 영상": 채널 자기 median 대비 배수(median_ratio)로 폭증 영상을 찾는다.
// 노이즈 필터 3종(UI_SPEC.md §7.1): 채널 표본 5개 미만 skip / 조회수 1000 미만 제외 / ratio 50배 초과 outlier 차단.

export type SurgeCandidateVideo = {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  viewCount: number;
  publishedAt: string;
  thumbnailUrl?: string;
};

export type ChannelBaseline = {
  channelId: string;
  medianViewCount: number;
  sampleSize: number;
};

export type SurgedVideo = SurgeCandidateVideo & {
  ratio: number;
  channelMedianViewCount: number;
};

const MIN_CHANNEL_SAMPLE = 5;
const MIN_VIEW_COUNT = 1000;
const MAX_RATIO_OUTLIER = 50;

export function detectSurgedVideos(
  videos: SurgeCandidateVideo[],
  baselines: ChannelBaseline[],
  threshold: number,
): SurgedVideo[] {
  const baselineByChannel = new Map(baselines.map((b) => [b.channelId, b]));
  const result: SurgedVideo[] = [];

  for (const video of videos) {
    if (video.viewCount < MIN_VIEW_COUNT) continue;

    const baseline = baselineByChannel.get(video.channelId);
    if (!baseline || baseline.sampleSize < MIN_CHANNEL_SAMPLE || baseline.medianViewCount <= 0) continue;

    const ratio = video.viewCount / baseline.medianViewCount;
    if (ratio < threshold || ratio > MAX_RATIO_OUTLIER) continue;

    result.push({ ...video, ratio, channelMedianViewCount: baseline.medianViewCount });
  }

  return result.sort((a, b) => b.ratio - a.ratio);
}
