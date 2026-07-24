-- CreateEnum
CREATE TYPE "RoomMode" AS ENUM ('PLAYLIST', 'CAST');

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "mode" "RoomMode" NOT NULL DEFAULT 'PLAYLIST';
