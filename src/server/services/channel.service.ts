import type { VideoFormat } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// oauthAccessToken/oauthRefreshToken은 절대 클라이언트로 내려가면 안 되므로 select로 명시 허용한다.
// 다른 서비스에서 channel을 include할 때도 이 select를 재사용한다.
export const CHANNEL_SELECT = {
  id: true,
  name: true,
  youtubeChannelId: true,
  videoFormat: true,
  defaultSettings: true,
  isActive: true,
  oauthConnectedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function listChannels() {
  return prisma.channel.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: CHANNEL_SELECT,
  });
}

export function createChannel(input: { name: string; videoFormat?: VideoFormat }) {
  return prisma.channel.create({
    data: {
      name: input.name,
      videoFormat: input.videoFormat ?? "SHORT",
      defaultSettings: {},
    },
    select: CHANNEL_SELECT,
  });
}
