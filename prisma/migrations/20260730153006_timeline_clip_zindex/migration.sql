-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TimelineClip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackId" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER NOT NULL,
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimelineClip_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "TimelineTrack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TimelineClip" ("createdAt", "endMs", "id", "payload", "startMs", "trackId", "updatedAt") SELECT "createdAt", "endMs", "id", "payload", "startMs", "trackId", "updatedAt" FROM "TimelineClip";
DROP TABLE "TimelineClip";
ALTER TABLE "new_TimelineClip" RENAME TO "TimelineClip";
CREATE INDEX "TimelineClip_trackId_idx" ON "TimelineClip"("trackId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
