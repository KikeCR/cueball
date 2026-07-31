-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "nowPlayingQueueItemId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "rooms_nowPlayingQueueItemId_key" ON "rooms"("nowPlayingQueueItemId");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_nowPlayingQueueItemId_fkey" FOREIGN KEY ("nowPlayingQueueItemId") REFERENCES "queue_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
