import type { Server } from "socket.io"
import {
  SocketEvents,
  type ActionError,
  type RoomJoinPayload,
  type RoomJoinResult,
  type RoomStatePayload,
} from "@cueball/shared"
import { markConnected, markDisconnected } from "../redis/presence.js"
import { addParticipant, getRoomState } from "../services/roomService.js"
import { prisma } from "../services/prisma.js"
import {
  signParticipantToken,
  verifyParticipantToken,
} from "../services/tokens.js"
import { broadcastRoomState } from "./broadcast.js"
import type { RoomSocket } from "./types.js"

const MAX_GUEST_NAME_LENGTH = 40

async function reconnect(
  socket: RoomSocket,
  participantId: string,
  roomId: string,
): Promise<boolean> {
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
  })
  if (!participant || participant.roomId !== roomId) return false

  socket.data.participantId = participant.id
  socket.data.roomId = roomId
  await socket.join(roomId)
  await markConnected(roomId, participant.id)
  return true
}

async function leaveCurrentRoom(io: Server, socket: RoomSocket): Promise<void> {
  const { participantId, roomId } = socket.data
  if (!participantId || !roomId) return

  await markDisconnected(roomId, participantId)
  socket.leave(roomId)
  socket.data.participantId = undefined
  socket.data.roomId = undefined
  await broadcastRoomState(io, roomId)
}

export function registerRoomHandlers(io: Server): void {
  io.on("connection", (socket: RoomSocket) => {
    void (async () => {
      const token = socket.handshake.auth?.token as string | undefined
      if (!token) return
      const decoded = verifyParticipantToken(token)
      if (!decoded) return
      const reconnected = await reconnect(
        socket,
        decoded.participantId,
        decoded.roomId,
      )
      if (reconnected) await broadcastRoomState(io, decoded.roomId)
    })()

    socket.on(
      SocketEvents.RoomJoin,
      (
        payload: RoomJoinPayload,
        ack?: (result: RoomJoinResult | ActionError) => void,
      ) => {
        void (async () => {
          const guestName = payload.guestName
            ?.trim()
            .slice(0, MAX_GUEST_NAME_LENGTH)
          if (!guestName) {
            ack?.({ error: "guestName is required" })
            return
          }

          const room = await prisma.room.findUnique({
            where: { code: payload.roomCode.toUpperCase() },
          })
          if (!room) {
            ack?.({ error: "Room not found" })
            return
          }

          const participant = await addParticipant({
            roomId: room.id,
            guestName,
          })

          socket.data.participantId = participant.id
          socket.data.roomId = room.id
          await socket.join(room.id)
          await markConnected(room.id, participant.id)

          const state = await getRoomState(room.id)
          const self = state?.participants.find((p) => p.id === participant.id)
          if (!state || !self) {
            ack?.({ error: "Failed to join room" })
            return
          }

          ack?.({
            room: state.room,
            participant: self,
            participantToken: signParticipantToken(participant.id, room.id),
            participants: state.participants,
            queue: state.queue,
          })

          socket
            .to(room.id)
            .emit(SocketEvents.RoomState, state satisfies RoomStatePayload)
        })()
      },
    )

    socket.on(SocketEvents.RoomLeave, () => {
      void leaveCurrentRoom(io, socket)
    })

    socket.on("disconnect", () => {
      void leaveCurrentRoom(io, socket)
    })
  })
}
