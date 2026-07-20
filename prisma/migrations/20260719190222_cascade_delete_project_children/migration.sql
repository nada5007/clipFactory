-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AudioSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "filePath" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AudioSegment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AudioSegment" ("createdAt", "endMs", "filePath", "id", "model", "order", "projectId", "provider", "startMs", "text", "updatedAt", "voiceId") SELECT "createdAt", "endMs", "filePath", "id", "model", "order", "projectId", "provider", "startMs", "text", "updatedAt", "voiceId" FROM "AudioSegment";
DROP TABLE "AudioSegment";
ALTER TABLE "new_AudioSegment" RENAME TO "AudioSegment";
CREATE UNIQUE INDEX "AudioSegment_projectId_order_key" ON "AudioSegment"("projectId", "order");
CREATE TABLE "new_ImageAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImageAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ImageAsset" ("createdAt", "filePath", "id", "model", "order", "projectId", "prompt", "size", "updatedAt") SELECT "createdAt", "filePath", "id", "model", "order", "projectId", "prompt", "size", "updatedAt" FROM "ImageAsset";
DROP TABLE "ImageAsset";
ALTER TABLE "new_ImageAsset" RENAME TO "ImageAsset";
CREATE UNIQUE INDEX "ImageAsset_projectId_order_key" ON "ImageAsset"("projectId", "order");
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("createdAt", "error", "id", "message", "progress", "projectId", "status", "type", "updatedAt") SELECT "createdAt", "error", "id", "message", "progress", "projectId", "status", "type", "updatedAt" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE INDEX "Job_projectId_type_idx" ON "Job"("projectId", "type");
CREATE TABLE "new_Script" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imagePrompts" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Script_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Script" ("body", "createdAt", "hook", "id", "imagePrompts", "model", "projectId", "title", "topic", "updatedAt") SELECT "body", "createdAt", "hook", "id", "imagePrompts", "model", "projectId", "title", "topic", "updatedAt" FROM "Script";
DROP TABLE "Script";
ALTER TABLE "new_Script" RENAME TO "Script";
CREATE UNIQUE INDEX "Script_projectId_key" ON "Script"("projectId");
CREATE TABLE "new_UploadConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "tags" JSONB NOT NULL,
    "privacyStatus" TEXT NOT NULL DEFAULT 'PRIVATE',
    "scheduledPublishAt" DATETIME,
    "youtubeVideoId" TEXT,
    "uploadedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UploadConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UploadConfig" ("createdAt", "description", "id", "privacyStatus", "projectId", "scheduledPublishAt", "tags", "title", "updatedAt", "uploadedAt", "youtubeVideoId") SELECT "createdAt", "description", "id", "privacyStatus", "projectId", "scheduledPublishAt", "tags", "title", "updatedAt", "uploadedAt", "youtubeVideoId" FROM "UploadConfig";
DROP TABLE "UploadConfig";
ALTER TABLE "new_UploadConfig" RENAME TO "UploadConfig";
CREATE UNIQUE INDEX "UploadConfig_projectId_key" ON "UploadConfig"("projectId");
CREATE TABLE "new_VideoAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "subtitlePath" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VideoAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VideoAsset" ("createdAt", "durationMs", "filePath", "height", "id", "projectId", "subtitlePath", "updatedAt", "width") SELECT "createdAt", "durationMs", "filePath", "height", "id", "projectId", "subtitlePath", "updatedAt", "width" FROM "VideoAsset";
DROP TABLE "VideoAsset";
ALTER TABLE "new_VideoAsset" RENAME TO "VideoAsset";
CREATE UNIQUE INDEX "VideoAsset_projectId_key" ON "VideoAsset"("projectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
