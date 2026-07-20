import type { Prisma, SavedItemType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export function listSavedItems(type?: SavedItemType) {
  return prisma.savedItem.findMany({
    where: type ? { type } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

export function createSavedItem(input: { type: SavedItemType; snapshot: Prisma.InputJsonValue; note?: string }) {
  return prisma.savedItem.create({
    data: { type: input.type, snapshotJson: input.snapshot, note: input.note },
  });
}

export function deleteSavedItem(id: string) {
  return prisma.savedItem.delete({ where: { id } });
}
