import { syncPlaylistOrder } from "../services/youtubePlaylist.js"

const DEBOUNCE_MS = 4000
const timers = new Map<string, NodeJS.Timeout>()

/** Coalesces a burst of votes into a single playlist reorder call per room. */
export function schedulePlaylistSync(roomId: string): void {
  const existing = timers.get(roomId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(() => {
    timers.delete(roomId)
    syncPlaylistOrder(roomId).catch((err: unknown) => {
      console.error(
        `Failed to sync YouTube playlist order for room ${roomId}`,
        err,
      )
    })
  }, DEBOUNCE_MS)

  timers.set(roomId, timer)
}
