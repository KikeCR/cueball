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
import { withLoungeLock } from "./loungeLock.js"
import { notifyPlaylistSyncFailed } from "./playlistNotifications.js"

const DEBOUNCE_MS = 4000
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

    // No reorder primitive in the Lounge protocol — drop and re-add
    // everything in the new order, same as the drag-reorder handler.
    let session = lounge
    for (const item of ordered) {
      session = await removeVideoFromLoungeQueue(session, item.youtubeVideoId)
    }
    for (const item of ordered) {
      session = await addVideoToLoungeQueue(session, item.youtubeVideoId)
    }
    await setLoungeSessionState(roomId, session)
  })
}
