import { env } from "@/env";
import { cached } from "@/lib/cache";
import { recordQuotaUsage } from "@/lib/quota";

const BASE_URL = "https://www.googleapis.com/youtube/v3";

// 인기 영상/검색 결과는 1시간, 채널 정보는 24시간 캐시 (PROJECT_SPEC.md §2.1).
const SEARCH_TTL_SECONDS = 60 * 60;
const VIDEOS_TTL_SECONDS = 60 * 60;
const CHANNELS_TTL_SECONDS = 60 * 60 * 24;

// YouTube Data API v3 쿼터 비용: search.list=100, videos.list/channels.list/playlistItems.list/commentThreads.list=1 (읽기 기준 공식 문서 기준).
const QUOTA_COST = {
  search: 100,
  videos: 1,
  channels: 1,
  playlistItems: 1,
  commentThreads: 1,
} as const;

export type YoutubeSearchItem = {
  id: { videoId: string };
  snippet: {
    title: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: { medium?: { url: string } };
  };
};

export type YoutubeSearchResponse = {
  items: YoutubeSearchItem[];
  nextPageToken?: string;
};

export type YoutubeVideo = {
  id: string;
  snippet: {
    title: string;
    description?: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails?: { medium?: { url: string } };
  };
  statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration: string };
};

export type YoutubeVideosResponse = { items: YoutubeVideo[] };

export type YoutubeChannel = {
  id: string;
  snippet: { title: string };
  statistics: { subscriberCount?: string; videoCount?: string; viewCount?: string };
  contentDetails: { relatedPlaylists: { uploads: string } };
};

export type YoutubeChannelsResponse = { items: YoutubeChannel[] };

function requireApiKey(): string {
  if (!env.YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY가 설정되지 않았습니다. .env를 확인하세요.");
  }
  return env.YOUTUBE_API_KEY;
}

async function callYoutubeApi<T>(
  endpoint: keyof typeof QUOTA_COST,
  params: Record<string, string>,
  ttlSeconds: number,
): Promise<T> {
  const sortedParams = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const cacheKey = `youtube:${endpoint}:${new URLSearchParams(sortedParams).toString()}`;

  return cached(cacheKey, ttlSeconds, async () => {
    const apiKey = requireApiKey();
    const searchParams = new URLSearchParams({ ...params, key: apiKey });
    const res = await fetch(`${BASE_URL}/${endpoint}?${searchParams.toString()}`);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`YouTube API 요청 실패 (${endpoint}): ${res.status} ${body}`);
    }

    await recordQuotaUsage(`youtube.${endpoint}.list`, QUOTA_COST[endpoint]);
    return res.json() as Promise<T>;
  });
}

export function searchVideos(params: {
  q?: string;
  regionCode?: string;
  relevanceLanguage?: string;
  videoDuration?: "short" | "medium" | "long";
  videoCategoryId?: string;
  channelId?: string;
  order?: "relevance" | "viewCount" | "date" | "rating";
  maxResults?: number;
  publishedAfter?: string;
  publishedBefore?: string;
}) {
  return callYoutubeApi<YoutubeSearchResponse>(
    "search",
    {
      part: "snippet",
      type: "video",
      ...(params.q ? { q: params.q } : {}),
      ...(params.regionCode ? { regionCode: params.regionCode } : {}),
      ...(params.relevanceLanguage ? { relevanceLanguage: params.relevanceLanguage } : {}),
      ...(params.videoDuration ? { videoDuration: params.videoDuration } : {}),
      ...(params.videoCategoryId ? { videoCategoryId: params.videoCategoryId } : {}),
      ...(params.channelId ? { channelId: params.channelId } : {}),
      ...(params.order ? { order: params.order } : {}),
      ...(params.maxResults ? { maxResults: String(params.maxResults) } : {}),
      ...(params.publishedAfter ? { publishedAfter: params.publishedAfter } : {}),
      ...(params.publishedBefore ? { publishedBefore: params.publishedBefore } : {}),
    },
    SEARCH_TTL_SECONDS,
  );
}

export function listVideos(videoIds: string[]) {
  return callYoutubeApi<YoutubeVideosResponse>(
    "videos",
    { part: "snippet,statistics,contentDetails", id: videoIds.join(",") },
    VIDEOS_TTL_SECONDS,
  );
}

// UI_SPEC.md §7.1 탐색·분석: 지금 인기 영상 (mostPopular, 지역·카테고리별).
export function listPopularVideos(params: { regionCode?: string; categoryId?: string; maxResults?: number }) {
  return callYoutubeApi<YoutubeVideosResponse>(
    "videos",
    {
      part: "snippet,statistics",
      chart: "mostPopular",
      regionCode: params.regionCode ?? "KR",
      ...(params.categoryId ? { videoCategoryId: params.categoryId } : {}),
      maxResults: String(params.maxResults ?? 25),
    },
    VIDEOS_TTL_SECONDS,
  );
}

export function listChannels(channelIds: string[]) {
  return callYoutubeApi<YoutubeChannelsResponse>(
    "channels",
    { part: "snippet,statistics,contentDetails", id: channelIds.join(",") },
    CHANNELS_TTL_SECONDS,
  );
}

// UI_SPEC.md §7.1 채널 분석: 채널 URL/ID/핸들로 채널을 직접 조회한다 (id 또는 forHandle 중 하나 필수).
export function getChannel(params: { id?: string; forHandle?: string }) {
  return callYoutubeApi<YoutubeChannelsResponse>(
    "channels",
    {
      part: "snippet,statistics,contentDetails",
      ...(params.id ? { id: params.id } : {}),
      ...(params.forHandle ? { forHandle: params.forHandle } : {}),
    },
    CHANNELS_TTL_SECONDS,
  );
}

export type YoutubeChannelSearchResponse = {
  items: { id: { channelId: string }; snippet: { title: string; channelId?: string } }[];
};

export function searchChannels(query: string) {
  return callYoutubeApi<YoutubeChannelSearchResponse>(
    "search",
    { part: "snippet", type: "channel", q: query, maxResults: "1" },
    SEARCH_TTL_SECONDS,
  );
}

export type YoutubePlaylistItem = { contentDetails: { videoId: string; videoPublishedAt?: string } };
export type YoutubePlaylistItemsResponse = { items: YoutubePlaylistItem[]; nextPageToken?: string };

// UI_SPEC.md §7.1 채널 분석 "전수 스캔": uploads 플레이리스트 페이지네이션(50개/page).
export function listPlaylistItems(playlistId: string, pageToken?: string) {
  return callYoutubeApi<YoutubePlaylistItemsResponse>(
    "playlistItems",
    { part: "contentDetails", playlistId, maxResults: "50", ...(pageToken ? { pageToken } : {}) },
    VIDEOS_TTL_SECONDS,
  );
}

export type YoutubeVideoDetail = {
  id: string;
  snippet: {
    title: string;
    description: string;
    channelId: string;
    channelTitle: string;
    publishedAt: string;
    categoryId?: string;
    tags?: string[];
    thumbnails?: { medium?: { url: string }; maxres?: { url: string } };
  };
  statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails: { duration: string };
};
export type YoutubeVideoDetailResponse = { items: YoutubeVideoDetail[] };

// UI_SPEC.md §7.1 "영상 SEO": 제목/설명/태그/길이까지 필요해 snippet,statistics,contentDetails를 함께 조회한다.
export function getVideoDetail(videoId: string) {
  return callYoutubeApi<YoutubeVideoDetailResponse>(
    "videos",
    { part: "snippet,statistics,contentDetails", id: videoId },
    VIDEOS_TTL_SECONDS,
  );
}

export type YoutubeCommentThread = {
  snippet: {
    topLevelComment: {
      snippet: { textDisplay: string; likeCount: number; authorDisplayName: string };
    };
    totalReplyCount?: number;
  };
};
export type YoutubeCommentThreadsResponse = { items: YoutubeCommentThread[] };

const COMMENTS_TTL_SECONDS = 60 * 60;

// PROJECT_SPEC.md §2.3 "영상 분석 모달 (2.10)": commentThreads.list 상위 100개.
export function listCommentThreads(videoId: string, maxResults = 100) {
  return callYoutubeApi<YoutubeCommentThreadsResponse>(
    "commentThreads",
    { part: "snippet", videoId, maxResults: String(Math.min(maxResults, 100)), order: "relevance", textFormat: "plainText" },
    COMMENTS_TTL_SECONDS,
  );
}

// --- YouTube 업로드용 OAuth 2.0 (youtube.upload + youtube.readonly) ---
// UI_SPEC.md §2.1: "YouTube 계정 간편 연결". API 키가 아닌 채널별 OAuth 토큰으로 인증한다.

const OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

function requireOAuthCredentials(): { clientId: string; clientSecret: string } {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET이 설정되지 않았습니다. .env를 확인하세요.",
    );
  }
  return { clientId: env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET };
}

export function buildOAuthAuthorizationUrl(redirectUri: string, state: string): string {
  const { clientId } = requireOAuthCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: OAUTH_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type OAuthTokens = { accessToken: string; refreshToken?: string; expiresInSeconds: number };

export async function exchangeOAuthCode(code: string, redirectUri: string): Promise<OAuthTokens> {
  const { clientId, clientSecret } = requireOAuthCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    throw new Error(`OAuth 토큰 교환 실패: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresInSeconds: json.expires_in };
}

export async function refreshOAuthAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const { clientId, clientSecret } = requireOAuthCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`OAuth 토큰 갱신 실패: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: json.access_token, expiresInSeconds: json.expires_in };
}

export async function getMyChannel(
  accessToken: string,
): Promise<{ id: string; title: string } | null> {
  const res = await fetch(
    `${BASE_URL}/channels?part=snippet&mine=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    throw new Error(`채널 정보 조회 실패: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { items: { id: string; snippet: { title: string } }[] };
  const channel = json.items[0];
  return channel ? { id: channel.id, title: channel.snippet.title } : null;
}

export type UploadVideoMetadata = {
  title: string;
  description: string;
  tags: string[];
  privacyStatus: "public" | "unlisted" | "private";
  // UI_SPEC.md §4.6 "예약 업로드": 지정 시 YouTube가 이 시각에 자동 공개 전환한다.
  // YouTube API 요구사항상 publishAt이 있으면 privacyStatus는 반드시 private이어야 한다.
  publishAt?: string;
};

// 짧은 쇼츠 영상 기준 단순 multipart 업로드 (resumable 업로드 프로토콜은 범위 밖).
export async function uploadVideo(
  accessToken: string,
  metadata: UploadVideoMetadata,
  video: Buffer,
): Promise<{ videoId: string }> {
  const boundary = `tubeyou-${Date.now()}`;
  const metadataPart = JSON.stringify({
    snippet: { title: metadata.title, description: metadata.description, tags: metadata.tags },
    status: {
      privacyStatus: metadata.publishAt ? "private" : metadata.privacyStatus,
      ...(metadata.publishAt ? { publishAt: metadata.publishAt } : {}),
    },
  });

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataPart}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
    ),
    video,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const res = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: new Uint8Array(body),
    },
  );

  if (!res.ok) {
    throw new Error(`YouTube 업로드 실패: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { id: string };
  return { videoId: json.id };
}

// UI_SPEC.md §4.5 "[썸네일] 탭": 채널이 YouTube Studio 중급 기능(전화번호 인증)을 활성화해야
// 커스텀 썸네일 업로드가 가능하다. 미인증 채널은 이 호출이 403으로 실패한다 (호출부에서 안내형으로 처리).
export async function setThumbnail(accessToken: string, videoId: string, image: Buffer): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "image/png" },
      body: new Uint8Array(image),
    },
  );

  if (!res.ok) {
    throw new Error(`썸네일 업로드 실패: ${res.status} ${await res.text()}`);
  }
}
