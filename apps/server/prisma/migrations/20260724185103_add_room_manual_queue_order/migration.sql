-- AlterTable
-- Defaults to false (vote-driven order), preserving current behavior for
-- every existing room until a host explicitly drags an item.
ALTER TABLE "rooms" ADD COLUMN "manualQueueOrder" BOOLEAN NOT NULL DEFAULT false;
