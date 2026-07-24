-- Collapse duplicate participant rows for the same authenticated user in the
-- same room (pre-existing data from before joins were deduped by userId),
-- keeping the earliest row so joinedAt/isHost/id references stay stable.
-- Votes on a dropped duplicate cascade-delete; queue items it added just lose
-- their "addedBy" attribution (addedByParticipantId -> NULL). Guests
-- (userId IS NULL) are untouched.
DELETE FROM "participants" p
USING "participants" keep
WHERE p."userId" IS NOT NULL
  AND p."userId" = keep."userId"
  AND p."roomId" = keep."roomId"
  AND (
    keep."joinedAt" < p."joinedAt"
    OR (keep."joinedAt" = p."joinedAt" AND keep."id" < p."id")
  );

-- CreateIndex
CREATE UNIQUE INDEX "participants_roomId_userId_key" ON "participants"("roomId", "userId");
