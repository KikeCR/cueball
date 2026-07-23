-- AlterTable
ALTER TABLE "queue_items" ADD COLUMN     "youtubePlaylistItemId" TEXT;

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "youtubeAccessToken" TEXT,
ADD COLUMN     "youtubePlaylistId" TEXT,
ADD COLUMN     "youtubeRefreshToken" TEXT,
ADD COLUMN     "youtubeTokenExpiresAt" TIMESTAMP(3);
