import { prisma } from "@/lib/prisma";
import { readProjectFile, writeProjectFile } from "@/lib/storage";

const THUMBNAIL_RELATIVE_PATH = "thumbnail.png";

export function getThumbnail(projectId: string) {
  return prisma.thumbnailAsset.findUnique({ where: { projectId } });
}

export function readThumbnailFile(projectId: string) {
  return readProjectFile(projectId, THUMBNAIL_RELATIVE_PATH);
}

export async function saveThumbnail(
  projectId: string,
  image: Buffer,
  dimensions: { width: number; height: number },
) {
  await writeProjectFile(projectId, THUMBNAIL_RELATIVE_PATH, image);

  return prisma.thumbnailAsset.upsert({
    where: { projectId },
    create: { projectId, filePath: THUMBNAIL_RELATIVE_PATH, ...dimensions },
    update: { ...dimensions },
  });
}

export function deleteThumbnail(projectId: string) {
  return prisma.thumbnailAsset.delete({ where: { projectId } }).catch(() => null);
}
