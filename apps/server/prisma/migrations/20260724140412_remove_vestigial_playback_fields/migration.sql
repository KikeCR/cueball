-- DropForeignKey
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_controllerId_fkey";

-- DropForeignKey
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_currentTrackId_fkey";

-- DropIndex
DROP INDEX "rooms_controllerId_key";

-- DropIndex
DROP INDEX "rooms_currentTrackId_key";

-- AlterTable
ALTER TABLE "rooms" DROP COLUMN "controllerId",
DROP COLUMN "currentTrackId",
DROP COLUMN "playbackPosition",
DROP COLUMN "playbackState";

-- DropEnum
DROP TYPE "PlaybackState";

