import { afterEach, describe, expect, it, vi } from "vitest";

import { exchangeOAuthCode, getMyChannel, refreshOAuthAccessToken } from "@/lib/clients/youtube";
import { prisma } from "@/lib/prisma";
import {
  completeOAuthConnection,
  disconnectChannel,
  getValidAccessToken,
} from "@/server/services/channel-oauth.service";

vi.mock("@/lib/clients/youtube", async () => {
  const actual = await vi.importActual<typeof import("@/lib/clients/youtube")>("@/lib/clients/youtube");
  return {
    ...actual,
    exchangeOAuthCode: vi.fn(),
    refreshOAuthAccessToken: vi.fn(),
    getMyChannel: vi.fn(),
  };
});

async function createTestChannel() {
  return prisma.channel.create({ data: { name: "테스트 채널", defaultSettings: {} } });
}

async function cleanup(channelId: string) {
  await prisma.channel.delete({ where: { id: channelId } });
}

describe("completeOAuthConnection", () => {
  afterEach(() => {
    vi.mocked(exchangeOAuthCode).mockReset();
    vi.mocked(getMyChannel).mockReset();
  });

  it("토큰 교환 성공 시 채널에 OAuth 토큰과 YouTube 채널 정보를 저장한다", async () => {
    const channel = await createTestChannel();
    try {
      vi.mocked(exchangeOAuthCode).mockResolvedValue({
        accessToken: "access-1",
        refreshToken: "refresh-1",
        expiresInSeconds: 3600,
      });
      vi.mocked(getMyChannel).mockResolvedValue({ id: "UCxxxx", title: "내 채널" });

      const updated = await completeOAuthConnection(channel.id, "auth-code", "http://localhost/callback");

      expect(updated.oauthAccessToken).toBe("access-1");
      expect(updated.oauthRefreshToken).toBe("refresh-1");
      expect(updated.youtubeChannelId).toBe("UCxxxx");
      expect(updated.name).toBe("내 채널");
      expect(updated.oauthConnectedAt).not.toBeNull();
    } finally {
      await cleanup(channel.id);
    }
  });

  it("refresh token이 없으면 에러를 던진다", async () => {
    const channel = await createTestChannel();
    try {
      vi.mocked(exchangeOAuthCode).mockResolvedValue({ accessToken: "access-1", expiresInSeconds: 3600 });

      await expect(
        completeOAuthConnection(channel.id, "auth-code", "http://localhost/callback"),
      ).rejects.toThrow("refresh token");
    } finally {
      await cleanup(channel.id);
    }
  });
});

describe("disconnectChannel", () => {
  it("OAuth 토큰 필드를 모두 지운다", async () => {
    const channel = await prisma.channel.create({
      data: {
        name: "연결된 채널",
        defaultSettings: {},
        oauthAccessToken: "a",
        oauthRefreshToken: "r",
        oauthConnectedAt: new Date(),
      },
    });
    try {
      const updated = await disconnectChannel(channel.id);
      expect(updated.oauthAccessToken).toBeNull();
      expect(updated.oauthRefreshToken).toBeNull();
      expect(updated.oauthConnectedAt).toBeNull();
    } finally {
      await cleanup(channel.id);
    }
  });
});

describe("getValidAccessToken", () => {
  afterEach(() => {
    vi.mocked(refreshOAuthAccessToken).mockReset();
  });

  it("연결된 계정이 없으면 에러를 던진다", async () => {
    const channel = await createTestChannel();
    try {
      await expect(getValidAccessToken(channel.id)).rejects.toThrow("연결된 YouTube 계정이 없습니다");
    } finally {
      await cleanup(channel.id);
    }
  });

  it("만료되지 않은 토큰은 그대로 재사용한다", async () => {
    const channel = await prisma.channel.create({
      data: {
        name: "채널",
        defaultSettings: {},
        oauthAccessToken: "still-valid",
        oauthRefreshToken: "refresh-1",
        oauthAccessTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    try {
      const token = await getValidAccessToken(channel.id);
      expect(token).toBe("still-valid");
      expect(refreshOAuthAccessToken).not.toHaveBeenCalled();
    } finally {
      await cleanup(channel.id);
    }
  });

  it("만료된 토큰은 refresh token으로 갱신한다", async () => {
    const channel = await prisma.channel.create({
      data: {
        name: "채널",
        defaultSettings: {},
        oauthAccessToken: "expired",
        oauthRefreshToken: "refresh-1",
        oauthAccessTokenExpiresAt: new Date(Date.now() - 1000),
      },
    });
    try {
      vi.mocked(refreshOAuthAccessToken).mockResolvedValue({
        accessToken: "refreshed-token",
        expiresInSeconds: 3600,
      });

      const token = await getValidAccessToken(channel.id);
      expect(token).toBe("refreshed-token");
      expect(refreshOAuthAccessToken).toHaveBeenCalledWith("refresh-1");
    } finally {
      await cleanup(channel.id);
    }
  });
});
