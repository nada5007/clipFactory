import type { VideoFormat } from "@prisma/client";

export type VideoResolution = { width: number; height: number };

// 숏폼(9:16)은 1080x1920, 롱폼(16:9)은 1920x1080.
export function resolveVideoResolution(videoFormat: VideoFormat): VideoResolution {
  return videoFormat === "LONG" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
}

// 이미지 수만큼 총 영상 길이를 균등 분배한다 (씬별 타이밍 편집은 이후 단계에서 다룬다).
export function computePerImageDurationSec(totalDurationMs: number, imageCount: number): number {
  if (imageCount <= 0) {
    throw new Error("이미지 수는 1개 이상이어야 합니다.");
  }
  return totalDurationMs / 1000 / imageCount;
}
