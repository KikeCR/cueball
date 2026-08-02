import type { Server } from "socket.io"
import { RoomMode } from "@prisma/client"
import { prisma } from "../services/prisma.js"
import { sortQueueItems } from "../services/roomService.js"
import { getCastState } from "../redis/castSession.js"
import {
  getLoungeSessionState,
  setLoungeSessionState,
} from "../redis/castLoungeSession.js"
import {
  addVideoToLoungeQueue,
  removeVideoFromLoungeQueue,
} from "../services/youtubeLounge.js"
import { POLL_INTERVAL_MS } from "./castLoungePolling.js"
import { withLoungeLock } from "./loungeLock.js"
import { notifyPlaylistSyncFailed } from "./playlistNotifications.js"

// Must stay longer than POLL_INTERVAL_MS: `cast.currentQueueItemId` (used
// below to exclude whatever's actually playing right now from the reorder)
// is only ever as fresh as the last poll tick. A shorter debounce than that
// interval means a vote landing right as the receiver finishes a video can
// fire this before the poller has caught up, so the video that just started
// playing still looks "not yet playing" here — and gets removed and
// re-added to the live queue like anything else, which skips it.
const DEBOUNCE_MS = POLL_INTERVAL_MS + 1000
const timers = new Map<string, NodeJS.Timeout>()

/**
 * Coalesces a burst of votes into a single Lounge queue reorder per room —
 * the Cast-mode equivalent of schedulePlaylistSync. A vote reorders the
 * in-app queue by score immediately, but the receiver's own live queue has
 * no concept of score; it only ever reflects whatever order it was last
 * explicitly told (see the QueueReorder handler in sockets/queue.ts), so a
 * vote-driven reorder needs pushing to it too, not just a drag.
 */
export function scheduleCastQueueSync(io: Server, roomId: string): void {
  const existing = timers.get(roomId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    timers.delete(roomId)
    syncCastQueueOrder(roomId).catch((err: unknown) => {
      console.error(
        `Failed to sync the live Cast queue order for room ${roomId}`,
        err,
      )
      notifyPlaylistSyncFailed(
        io,
        roomId,
        "Couldn't update the TV's live queue order.",
      )
    })
  }, DEBOUNCE_MS)

  timers.set(roomId, timer)
}

async function syncCastQueueOrder(roomId: string): Promise<void> {
  // The whole thing (including the reads) runs under the lock, not just
  // the Lounge writes — the poller reconciling a video that just finished
  // can otherwise land between this reading "what's unplayed" and this
  // acting on it, so this would drop/re-add a set of videos that's already
  // stale by the time it runs.
  await withLoungeLock(roomId, async () => {
    const room = await prisma.room.findUnique({ where: { id: roomId } })
    if (!room || room.mode !== RoomMode.CAST) return

    const lounge = await getLoungeSessionState(roomId)
    if (!lounge) return

    const cast = await getCastState(roomId)
    const unplayed = await prisma.queueItem.findMany({
      where: { roomId, playedAt: null },
    })
    // Same exclusion as the drag-reorder handler: whatever's currently
    // playing is already on the TV, not waiting its turn.
    const ordered = sortQueueItems(unplayed, room.manualQueueOrder).filter(
      (item) => item.id !== cast?.currentQueueItemId,
    )
    if (ordered.length === 0) return

    let session = lounge
    for (const item of ordered) {
      try {
        session = await removeVideoFromLoungeQueue(session, item.youtubeVideoId)
      } catch (err) {
        console.error(
          `Failed to remove ${item.youtubeVideoId} from the live Cast queue for room ${roomId} while resyncing order`,
          err,
        )
      }
    }
    for (const item of ordered) {
      try {
        session = await addVideoToLoungeQueue(session, item.youtubeVideoId)
      } catch (err) {
        console.error(
          `Failed to re-add ${item.youtubeVideoId} to the live Cast queue for room ${roomId} while resyncing order`,
          err,
        )
      }
    }
    await setLoungeSessionState(roomId, session)
  })
}
