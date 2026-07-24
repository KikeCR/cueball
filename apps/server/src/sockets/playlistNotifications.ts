import type { Server } from "socket.io"
import { SocketEvents, type PlaylistSyncFailedPayload } from "@cueball/shared"

/**
 * Tells the room a YouTube playlist mutation failed. These calls happen
 * after the in-app queue has already updated (so the round-trip to Google
 * doesn't delay in-room feedback), which means a failure here is otherwise
 * invisible — logged server-side only — unless we broadcast it.
 */
export function notifyPlaylistSyncFailed(
  io: Server,
  roomId: string,
  reason: string,
): void {
  io.to(roomId).emit(SocketEvents.PlaylistSyncFailed, {
    reason,
  } satisfies PlaylistSyncFailedPayload)
}
