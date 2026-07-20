import {
  buildOAuthAuthorizationUrl,
  exchangeOAuthCode,
  getMyChannel,
  refreshOAuthAccessToken,
} from "@/lib/clients/youtube";
import { prisma } from "@/lib/prisma";

const TOKEN_REFRESH_MARGIN_MS = 60_000;

export function getAuthorizationUrl(channelId: string, redirectUri: string): string {
  return buildOAuthAuthorizationUrl(redirectUri, channelId);
}

export async function completeOAuthConnection(channelId: string, code: string, redirectUri: string) {
  const tokens = await exchangeOAuthCode(code, redirectUri);
  if (!tokens.refreshToken) {
    throw new Error(
      "Google이 refresh token을 반환하지 않았습니다. 채널 설정에서 연결 해제 후 다시 연결해주세요.",
    );
  }

  const myChannel = await getMyChannel(tokens.accessToken);

  return prisma.channel.update({
    where: { id: channelId },
    data: {
      oauthAccessToken: tokens.accessToken,
      oauthRefreshToken: tokens.refreshToken,
      oauthAccessTokenExpiresAt: new Date(Date.now() + tokens.expiresInSeconds * 1000),
      oauthConnectedAt: new Date(),
      ...(myChannel ? { youtubeChannelId: myChannel.id, name: myChannel.title } : {}),
    },
  });
}

export function disconnectChannel(channelId: string) {
  return prisma.channel.update({
    where: { id: channelId },
    data: {
      oauthAccessToken: null,
      oauthRefreshToken: null,
      oauthAccessTokenExpiresAt: null,
      oauthConnectedAt: null,
    },
  });
}

// 만료 임박(1분 이내) 또는 만료된 access token은 refresh token으로 자동 갱신한다.
export async function getValidAccessToken(channelId: string): Promise<string> {
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: channelId } });

  if (!channel.oauthRefreshToken) {
    throw new Error("채널에 연결된 YouTube 계정이 없습니다. 채널 설정에서 먼저 연결해주세요.");
  }

  const expiresAt = channel.oauthAccessTokenExpiresAt?.getTime() ?? 0;
  if (channel.oauthAccessToken && expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return channel.oauthAccessToken;
  }

  const refreshed = await refreshOAuthAccessToken(channel.oauthRefreshToken);
  await prisma.channel.update({
    where: { id: channelId },
    data: {
      oauthAccessToken: refreshed.accessToken,
      oauthAccessTokenExpiresAt: new Date(Date.now() + refreshed.expiresInSeconds * 1000),
    },
  });
  return refreshed.accessToken;
}
