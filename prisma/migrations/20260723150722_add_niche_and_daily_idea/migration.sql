-- CreateTable
CREATE TABLE "NicheSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DailyIdea" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "niches" JSONB NOT NULL,
    "ideasJson" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "NicheSetting_category_key" ON "NicheSetting"("category");

-- CreateIndex
CREATE UNIQUE INDEX "DailyIdea_date_key" ON "DailyIdea"("date");
