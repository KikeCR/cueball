import type { Server } from "socket.io"
import {
  describeYoutubePlaylistError,
  syncPlaylistOrder,
} from "../services/youtubePlaylist.js"
import { notifyPlaylistSyncFailed } from "./playlistNotifications.js"

const DEBOUNCE_MS = 4000
const timers = new Map<string, NodeJS.Timeout>()

/** Coalesces a burst of votes into a single playlist reorder call per room. */
export function schedulePlaylistSync(io: Server, roomId: string): void {
  const existing = timers.get(roomId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    timers.delete(roomId)
    syncPlaylistOrder(roomId).catch((err: unknown) => {
      console.error(
        `Failed to sync YouTube playlist order for room ${roomId}`,
        err,
      )
      notifyPlaylistSyncFailed(
        io,
        roomId,
        `Couldn't update the YouTube playlist order. ${describeYoutubePlaylistError(err)}`,
      )
    })
  }, DEBOUNCE_MS)

  timers.set(roomId, timer)
}
