export type ScannedVideo = {
  videoId: string;
  title: string;
  viewCount: number;
  publishedAt: string;
  thumbnailUrl?: string;
};

export type ScannedVideoWithRatio = ScannedVideo & { ratio: number };

export type HeatmapCell = {
  dayOfWeek: number;
  hour: number;
  videoCount: number;
  avgViewCount: number;
};

export type ChannelScanResult = {
  videoCount: number;
  medianViewCount: number;
  videos: ScannedVideoWithRatio[];
  topVideos: ScannedVideoWithRatio[];
  surgedVideos: ScannedVideoWithRatio[];
  heatmap: HeatmapCell[];
};

// PROJECT_SPEC.md §2.5 "전체 영상 스캔": median 대비 배수로 떡상 영상을 표시 (떡상 영상 탭과 동일한 median_ratio 개념).
const SURGE_THRESHOLD = 3;
const TOP_VIDEO_COUNT = 10;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function buildHeatmap(videos: ScannedVideo[]): HeatmapCell[] {
  const cells = new Map<string, { dayOfWeek: number; hour: number; totalViews: number; count: number }>();

  for (const video of videos) {
    const kst = new Date(new Date(video.publishedAt).getTime() + KST_OFFSET_MS);
    const dayOfWeek = kst.getUTCDay();
    const hour = kst.getUTCHours();
    const key = `${dayOfWeek}-${hour}`;
    const existing = cells.get(key) ?? { dayOfWeek, hour, totalViews: 0, count: 0 };
    existing.totalViews += video.viewCount;
    existing.count += 1;
    cells.set(key, existing);
  }

  return Array.from(cells.values()).map((c) => ({
    dayOfWeek: c.dayOfWeek,
    hour: c.hour,
    videoCount: c.count,
    avgViewCount: c.totalViews / c.count,
  }));
}

export function analyzeChannelVideos(videos: ScannedVideo[]): ChannelScanResult {
  if (videos.length === 0) {
    return { videoCount: 0, medianViewCount: 0, videos: [], topVideos: [], surgedVideos: [], heatmap: [] };
  }

  const medianViewCount = median(videos.map((v) => v.viewCount));
  const withRatio: ScannedVideoWithRatio[] = [...videos]
    .map((v) => ({ ...v, ratio: medianViewCount > 0 ? v.viewCount / medianViewCount : 0 }))
    .sort((a, b) => b.viewCount - a.viewCount);

  const topVideos = withRatio.slice(0, TOP_VIDEO_COUNT);
  const surgedVideos = withRatio.filter((v) => v.ratio >= SURGE_THRESHOLD).sort((a, b) => b.ratio - a.ratio);

  return {
    videoCount: videos.length,
    medianViewCount,
    videos: withRatio,
    topVideos,
    surgedVideos,
    heatmap: buildHeatmap(videos),
  };
}
