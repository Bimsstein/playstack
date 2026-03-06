-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('WANT_TO_PLAY', 'PLAYING', 'DONE');

-- CreateEnum
CREATE TYPE "GameSource" AS ENUM ('PLAYSTATION', 'STEAM', 'NINTENDO');

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "source" "GameSource" NOT NULL DEFAULT 'PLAYSTATION',
    "psnTitleId" TEXT,
    "steamAppId" INTEGER,
    "nintendoGameId" TEXT,
    "title" TEXT NOT NULL,
    "platform" TEXT,
    "coverUrl" TEXT,
    "currentPrice" TEXT,
    "lowestPrice30Days" TEXT,
    "psnStoreRating" DOUBLE PRECISION,
    "wantBaselinePrice" DOUBLE PRECISION,
    "priceAlertActive" BOOLEAN NOT NULL DEFAULT false,
    "lastAlertPrice" DOUBLE PRECISION,
    "lastAlertAt" TIMESTAMP(3),
    "status" "GameStatus" NOT NULL DEFAULT 'WANT_TO_PLAY',
    "rating" INTEGER,
    "trophyCompletion" INTEGER,
    "earnedTrophies" INTEGER,
    "totalTrophies" INTEGER,
    "storyPlusHours" INTEGER,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "gameId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PsnLibraryTitle" (
    "id" TEXT NOT NULL,
    "psnTitleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "platform" TEXT,
    "coverUrl" TEXT,
    "trophyCompletion" INTEGER,
    "earnedTrophies" INTEGER,
    "totalTrophies" INTEGER,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PsnLibraryTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SteamLibraryTitle" (
    "id" TEXT NOT NULL,
    "steamAppId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "platform" TEXT,
    "coverUrl" TEXT,
    "playtimeHours" INTEGER,
    "trophyCompletion" INTEGER,
    "earnedTrophies" INTEGER,
    "totalTrophies" INTEGER,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SteamLibraryTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NintendoLibraryTitle" (
    "id" TEXT NOT NULL,
    "nintendoGameId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "platform" TEXT,
    "coverUrl" TEXT,
    "currentPrice" TEXT,
    "lowestPrice30Days" TEXT,
    "releaseDate" TEXT,
    "trophyCompletion" INTEGER,
    "earnedTrophies" INTEGER,
    "totalTrophies" INTEGER,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NintendoLibraryTitle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_psnTitleId_key" ON "Game"("psnTitleId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_steamAppId_key" ON "Game"("steamAppId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_nintendoGameId_key" ON "Game"("nintendoGameId");

-- CreateIndex
CREATE INDEX "Notification_readAt_createdAt_idx" ON "Notification"("readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_gameId_idx" ON "Notification"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "PsnLibraryTitle_psnTitleId_key" ON "PsnLibraryTitle"("psnTitleId");

-- CreateIndex
CREATE UNIQUE INDEX "SteamLibraryTitle_steamAppId_key" ON "SteamLibraryTitle"("steamAppId");

-- CreateIndex
CREATE UNIQUE INDEX "NintendoLibraryTitle_nintendoGameId_key" ON "NintendoLibraryTitle"("nintendoGameId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;
