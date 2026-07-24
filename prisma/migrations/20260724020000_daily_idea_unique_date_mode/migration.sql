-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DailyIdea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "niches" JSONB NOT NULL,
    "ideasJson" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DailyIdea" ("id", "date", "mode", "niches", "ideasJson", "createdAt", "updatedAt")
SELECT "id", "date", "mode", "niches", "ideasJson", "createdAt", "updatedAt" FROM "DailyIdea";
DROP TABLE "DailyIdea";
ALTER TABLE "new_DailyIdea" RENAME TO "DailyIdea";
CREATE UNIQUE INDEX "DailyIdea_date_mode_key" ON "DailyIdea"("date", "mode");
PRAGMA foreign_keys=ON;
