-- CreateTable
CREATE TABLE "UploadedMedia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadedMedia_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TimelineTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timelineId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "autoSync" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimelineTrack_timelineId_fkey" FOREIGN KEY ("timelineId") REFERENCES "Timeline" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TimelineTrack" ("createdAt", "id", "locked", "name", "order", "timelineId", "type", "updatedAt", "visible") SELECT "createdAt", "id", "locked", "name", "order", "timelineId", "type", "updatedAt", "visible" FROM "TimelineTrack";
DROP TABLE "TimelineTrack";
ALTER TABLE "new_TimelineTrack" RENAME TO "TimelineTrack";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
