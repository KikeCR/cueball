import type { Server } from "socket.io"
import { SocketEvents, type RoomStatePayload } from "@cueball/shared"
import { getRoomState } from "../services/roomService.js"

export async function broadcastRoomState(
  io: Server,
  roomId: string,
): Promise<void> {
  const state = await getRoomState(roomId)
  io.to(roomId).emit(SocketEvents.RoomState, state satisfies RoomStatePayload)
}
