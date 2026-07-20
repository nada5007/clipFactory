import type { VideoFormat } from "@prisma/client";

// 프로젝트 생성 시 채널 기본값을 프로젝트로 복사(스냅샷)하는 규칙.
// PROJECT_SPEC.md §1.2: "채널의 defaultSettings가 프로젝트 settings로 복사됨
// (이후 프로젝트에서 수정하면 프로젝트 값이 최종 적용)".
export function resolveProjectDefaults(
  channel: { videoFormat: VideoFormat; defaultSettings: unknown },
  input: { videoFormat?: VideoFormat },
) {
  return {
    videoFormat: input.videoFormat ?? channel.videoFormat,
    settings: channel.defaultSettings ?? {},
  };
}
