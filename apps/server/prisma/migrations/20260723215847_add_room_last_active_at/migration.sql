-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "rooms_lastActiveAt_idx" ON "rooms"("lastActiveAt");
