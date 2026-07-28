import type { Channel, CreationType, Project, ProjectStatus, ReviewStatus, VideoFormat } from "@prisma/client";

// API 응답은 JSON 직렬화되므로 Date 필드가 string으로 내려온다.
export type SerializedProject = Omit<Project, "createdAt" | "updatedAt" | "settings"> & {
  createdAt: string;
  updatedAt: string;
  settings: unknown;
  channel: SerializedChannel;
};

// oauthAccessToken/oauthRefreshToken/oauthAccessTokenExpiresAt은 API에서 절대 내려주지 않는
// 서버 전용 필드이므로 클라이언트 타입에서 제외한다 (server/services/channel.service.ts의 CHANNEL_SELECT와 대응).
export type SerializedChannel = Omit<
  Channel,
  | "createdAt"
  | "updatedAt"
  | "defaultSettings"
  | "oauthAccessToken"
  | "oauthRefreshToken"
  | "oauthAccessTokenExpiresAt"
  | "oauthConnectedAt"
> & {
  createdAt: string;
  updatedAt: string;
  defaultSettings: unknown;
  oauthConnectedAt: string | null;
};

export type SerializedScript = {
  id: string;
  projectId: string;
  topic: string;
  title: string;
  hook: string;
  body: string;
  imagePrompts: string[];
  model: string;
  createdAt: string;
  updatedAt: string;
};

export type SerializedAudioSegment = {
  id: string;
  projectId: string;
  order: number;
  text: string;
  startMs: number;
  endMs: number;
  filePath: string;
  provider: string;
  voiceId: string;
  model: string;
  settings: {
    audioFormat?: "mp3" | "wav" | "ogg";
    instructions?: string;
    speed?: number;
    elevenlabs?: { stability: number; similarityBoost: number; style: number; speed: number };
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type SerializedImageAsset = {
  id: string;
  projectId: string;
  order: number;
  prompt: string;
  filePath: string | null;
  model: string;
  quality: string | null;
  size: string;
  createdAt: string;
  updatedAt: string;
};

export type SerializedVideoAsset = {
  id: string;
  projectId: string;
  filePath: string;
  subtitlePath: string;
  durationMs: number;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
};

export type SerializedUploadConfig = {
  id: string;
  projectId: string;
  title: string | null;
  description: string | null;
  tags: string[];
  privacyStatus: "PUBLIC" | "UNLISTED" | "PRIVATE";
  scheduledPublishAt: string | null;
  youtubeVideoId: string | null;
  uploadedAt: string | null;
  createdAt: string;
  updatedAt: string;
  thumbnailWarning?: string | null;
};

export type ProjectListResponse = {
  items: SerializedProject[];
  total: number;
  page: number;
  pageSize: number;
};

export type { ProjectStatus, ReviewStatus, CreationType, VideoFormat };
