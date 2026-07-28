-- CreateTable
CREATE TABLE "BgmTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "youtubeId" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '기타',
    "durationSec" INTEGER,
    "filePath" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BgmTrack_youtubeId_key" ON "BgmTrack"("youtubeId");
