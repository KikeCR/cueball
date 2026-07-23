import type { Server } from "socket.io"
import { SocketEvents, type RoomStatePayload } from "@cueball/shared"
import { getRoomState } from "../services/roomService.js"

export async function broadcastRoomState(
  io: Server,
  roomId: string,
): Promise<void> {
  const state = await getRoomState(roomId)
  if (!state) {
    // The room was deleted (or never existed) out from under a socket that
    // was still joined to it. Nothing to broadcast, and definitely not
    // worth taking down every other room's connections over.
    console.warn(`Skipped room:state broadcast for missing room ${roomId}`)
    return
  }
  io.to(roomId).emit(SocketEvents.RoomState, state satisfies RoomStatePayload)
}
