import type { Socket } from "socket.io"

export interface SocketData {
  participantId?: string
  roomId?: string
  userId?: string
}

export type RoomSocket = Socket<
  Record<string, never>,
  Record<string, never>,
  Record<string, never>,
  SocketData
>
