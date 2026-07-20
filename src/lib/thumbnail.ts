import type { VideoFormat } from "@prisma/client";

export type ThumbnailResolution = { width: number; height: number };

// UI_SPEC.md §4.5 "[썸네일] 탭": 숏폼은 1080x1920 세로, 롱폼은 YouTube 권장 1280x720 표준.
export function resolveThumbnailResolution(videoFormat: VideoFormat): ThumbnailResolution {
  return videoFormat === "LONG" ? { width: 1280, height: 720 } : { width: 1080, height: 1920 };
}
