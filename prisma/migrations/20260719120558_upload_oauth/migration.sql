-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "oauthAccessToken" TEXT;
ALTER TABLE "Channel" ADD COLUMN "oauthAccessTokenExpiresAt" DATETIME;
ALTER TABLE "Channel" ADD COLUMN "oauthConnectedAt" DATETIME;
ALTER TABLE "Channel" ADD COLUMN "oauthRefreshToken" TEXT;

-- CreateTable
CREATE TABLE "UploadConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "tags" JSONB NOT NULL,
    "privacyStatus" TEXT NOT NULL DEFAULT 'PRIVATE',
    "youtubeVideoId" TEXT,
    "uploadedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UploadConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadConfig_projectId_key" ON "UploadConfig"("projectId");
