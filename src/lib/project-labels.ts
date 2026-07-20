import type { ProjectStatus, VideoFormat } from "@prisma/client";

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: "초안",
  SCRIPTING: "대본 작성 중",
  IMAGING: "이미지 생성 중",
  TTS: "음성 생성 중",
  EDITING: "편집 중",
  RENDERED: "렌더링 완료",
  UPLOADED: "업로드 완료",
  FAILED: "실패",
};

export const STATUS_BADGE_CLASS: Record<ProjectStatus, string> = {
  DRAFT: "bg-secondary text-secondary-foreground",
  SCRIPTING: "bg-accent text-accent-foreground",
  IMAGING: "bg-accent text-accent-foreground",
  TTS: "bg-accent text-accent-foreground",
  EDITING: "bg-accent text-accent-foreground",
  RENDERED: "bg-accent text-accent-foreground",
  UPLOADED: "bg-green-100 text-green-700",
  FAILED: "bg-destructive/10 text-destructive",
};

export const VIDEO_FORMAT_LABEL: Record<VideoFormat, string> = {
  SHORT: "숏폼 (9:16)",
  LONG: "롱폼 (16:9)",
};

export const SORT_LABEL = {
  latest: "최신순",
  oldest: "오래된순",
  title: "제목순",
  progress: "진행률순",
} as const;

export const PIPELINE_STEPS = [
  { key: "script", label: "스크립트", threshold: 20 },
  { key: "image", label: "이미지", threshold: 40 },
  { key: "tts", label: "TTS", threshold: 60 },
  { key: "edit", label: "편집", threshold: 80 },
  { key: "video", label: "영상", threshold: 100 },
] as const;
