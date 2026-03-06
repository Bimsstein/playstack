-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Game" ADD COLUMN "userId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "userId" TEXT;
ALTER TABLE "PsnLibraryTitle" ADD COLUMN "userId" TEXT;
ALTER TABLE "SteamLibraryTitle" ADD COLUMN "userId" TEXT;
ALTER TABLE "NintendoLibraryTitle" ADD COLUMN "userId" TEXT;

-- Drop old unique indexes
DROP INDEX IF EXISTS "Game_psnTitleId_key";
DROP INDEX IF EXISTS "Game_steamAppId_key";
DROP INDEX IF EXISTS "Game_nintendoGameId_key";
DROP INDEX IF EXISTS "PsnLibraryTitle_psnTitleId_key";
DROP INDEX IF EXISTS "SteamLibraryTitle_steamAppId_key";
DROP INDEX IF EXISTS "NintendoLibraryTitle_nintendoGameId_key";

-- Create new unique indexes scoped by user
CREATE UNIQUE INDEX "Game_userId_psnTitleId_key" ON "Game"("userId", "psnTitleId");
CREATE UNIQUE INDEX "Game_userId_steamAppId_key" ON "Game"("userId", "steamAppId");
CREATE UNIQUE INDEX "Game_userId_nintendoGameId_key" ON "Game"("userId", "nintendoGameId");
CREATE UNIQUE INDEX "PsnLibraryTitle_userId_psnTitleId_key" ON "PsnLibraryTitle"("userId", "psnTitleId");
CREATE UNIQUE INDEX "SteamLibraryTitle_userId_steamAppId_key" ON "SteamLibraryTitle"("userId", "steamAppId");
CREATE UNIQUE INDEX "NintendoLibraryTitle_userId_nintendoGameId_key" ON "NintendoLibraryTitle"("userId", "nintendoGameId");

-- Create additional indexes
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");
CREATE INDEX "Game_userId_status_updatedAt_idx" ON "Game"("userId", "status", "updatedAt");
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");
CREATE INDEX "PsnLibraryTitle_userId_updatedAt_idx" ON "PsnLibraryTitle"("userId", "updatedAt");
CREATE INDEX "SteamLibraryTitle_userId_updatedAt_idx" ON "SteamLibraryTitle"("userId", "updatedAt");
CREATE INDEX "NintendoLibraryTitle_userId_updatedAt_idx" ON "NintendoLibraryTitle"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PsnLibraryTitle" ADD CONSTRAINT "PsnLibraryTitle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SteamLibraryTitle" ADD CONSTRAINT "SteamLibraryTitle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NintendoLibraryTitle" ADD CONSTRAINT "NintendoLibraryTitle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
