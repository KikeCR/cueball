-- AlterTable
ALTER TABLE "queue_items" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill: preserve each room's current score-based order as the initial
-- explicit position, so existing queues don't visually reshuffle the moment
-- this ships. Going forward position is independent of score.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "roomId" ORDER BY "score" DESC, "createdAt" ASC
  ) - 1 AS rn
  FROM "queue_items"
)
UPDATE "queue_items" q
SET "position" = ranked.rn
FROM ranked
WHERE q."id" = ranked."id";
