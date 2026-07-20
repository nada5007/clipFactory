import { Prisma, type CreationType, type ProjectStatus, type VideoFormat } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { resolveProjectDefaults } from "@/lib/project-defaults";
import { CHANNEL_SELECT } from "@/server/services/channel.service";

const PAGE_SIZE = 12;

export type ProjectSort = "latest" | "oldest" | "title" | "progress";

const SORT_ORDER_BY: Record<ProjectSort, Prisma.ProjectOrderByWithRelationInput> = {
  latest: { createdAt: "desc" },
  oldest: { createdAt: "asc" },
  title: { title: "asc" },
  progress: { progress: "desc" },
};

export type ListProjectsInput = {
  q?: string;
  channelId?: string;
  status?: ProjectStatus;
  videoFormat?: VideoFormat;
  sort?: ProjectSort;
  page?: number;
};

export async function listProjects(input: ListProjectsInput) {
  const page = input.page && input.page > 0 ? input.page : 1;
  const where: Prisma.ProjectWhereInput = {
    ...(input.q ? { title: { contains: input.q } } : {}),
    ...(input.channelId ? { channelId: input.channelId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.videoFormat ? { videoFormat: input.videoFormat } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: SORT_ORDER_BY[input.sort ?? "latest"],
      include: { channel: { select: CHANNEL_SELECT } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.project.count({ where }),
  ]);

  return { items, total, page, pageSize: PAGE_SIZE };
}

export function getProject(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: { channel: { select: CHANNEL_SELECT } },
  });
}

export async function createProject(input: {
  channelId: string;
  title: string;
  description?: string;
  creationType?: CreationType;
  videoFormat?: VideoFormat;
}) {
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: input.channelId } });
  const defaults = resolveProjectDefaults(channel, { videoFormat: input.videoFormat });

  return prisma.project.create({
    data: {
      title: input.title,
      description: input.description,
      channelId: input.channelId,
      creationType: input.creationType ?? "MANUAL",
      videoFormat: defaults.videoFormat,
      settings: defaults.settings as Prisma.InputJsonValue,
    },
  });
}

export function updateProject(
  id: string,
  input: {
    title?: string;
    description?: string;
    reviewStatus?: "PENDING" | "REVIEWED";
    settings?: Prisma.InputJsonValue;
  },
) {
  return prisma.project.update({ where: { id }, data: input });
}

export async function duplicateProject(id: string) {
  const source = await prisma.project.findUniqueOrThrow({ where: { id } });

  return prisma.project.create({
    data: {
      title: `${source.title} 사본`,
      description: source.description,
      channelId: source.channelId,
      creationType: source.creationType,
      videoFormat: source.videoFormat,
      settings: source.settings ?? {},
    },
  });
}

export function deleteProject(id: string) {
  return prisma.project.delete({ where: { id } });
}
