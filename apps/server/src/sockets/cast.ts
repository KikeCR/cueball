import type { Server } from "socket.io"
import {
  SocketEvents,
  type ActionError,
  type ActionOk,
  type CastAdvanceResult,
  type CastCommandPayload,
  type CastSessionStartedPayload,
  type CastSessionState,
  type CastStateReportPayload,
} from "@cueball/shared"
import {
  clearCastState,
  getCastState,
  setCastState,
} from "../redis/castSession.js"
import {
  commitQueueItemPlayed,
  findQueueItemForPlayedToggle,
} from "../services/queueService.js"
import { getRoomState } from "../services/roomService.js"
import { prisma } from "../services/prisma.js"
import { broadcastRoomState } from "./broadcast.js"
import type { RoomSocket } from "./types.js"

type Ack = (result: ActionOk | ActionError) => void
type AdvanceAck = (result: CastAdvanceResult | ActionError) => void

export function registerCastHandlers(io: Server): void {
  io.on("connection", (socket: RoomSocket) => {
    socket.on(
      SocketEvents.CastSessionStarted,
      (payload: CastSessionStartedPayload, ack?: Ack) => {
        void (async () => {
          const { participantId, roomId } = socket.data
          if (!participantId || !roomId) {
            ack?.({ error: "Join a room first" })
            return
          }

          const participant = await prisma.participant.findUnique({
            where: { id: participantId },
          })
          if (!participant?.isHost) {
            ack?.({ error: "Only the host can connect a TV" })
            return
          }

          const state: CastSessionState = {
            connected: true,
            deviceName: payload.deviceName,
            casterParticipantId: participantId,
            isPlaying: false,
            currentQueueItemId: null,
          }
          await setCastState(roomId, state)
          ack?.({ ok: true })
          await broadcastRoomState(io, roomId)
        })()
      },
    )

    socket.on(SocketEvents.CastSessionEnded, (ack?: Ack) => {
      void (async () => {
        const { participantId, roomId } = socket.data
        if (!participantId || !roomId) {
          ack?.({ error: "Join a room first" })
          return
        }

        const participant = await prisma.participant.findUnique({
          where: { id: participantId },
        })
        if (!participant?.isHost) {
          ack?.({ error: "Only the host can end the cast session" })
          return
        }

        await clearCastState(roomId)
        ack?.({ ok: true })
        await broadcastRoomState(io, roomId)
      })()
    })

    // A pure relay: no DB write, no permission beyond room membership. Every
    // client in the room receives the re-broadcast; only the one holding the
    // live Cast session (the caster) actually acts on it against the Cast
    // SDK, so any participant can drive playback without the server needing
    // to know which browser owns the session.
    socket.on(
      SocketEvents.CastCommand,
      (payload: CastCommandPayload, ack?: Ack) => {
        const { participantId, roomId } = socket.data
        if (!participantId || !roomId) {
          ack?.({ error: "Join a room first" })
          return
        }
        ack?.({ ok: true })
        io.to(roomId).emit(SocketEvents.CastCommand, payload)
      },
    )

    socket.on(
      SocketEvents.CastStateReport,
      (payload: CastStateReportPayload, ack?: Ack) => {
        void (async () => {
          const { participantId, roomId } = socket.data
          if (!participantId || !roomId) {
            ack?.({ error: "Join a room first" })
            return
          }

          const participant = await prisma.participant.findUnique({
            where: { id: participantId },
          })
          if (!participant?.isHost) {
            ack?.({ error: "Only the host can report cast state" })
            return
          }

          const current = await getCastState(roomId)
          if (!current) {
            ack?.({ error: "No active cast session" })
            return
          }

          await setCastState(roomId, {
            ...current,
            isPlaying: payload.isPlaying,
            currentQueueItemId: payload.currentQueueItemId,
          })
          ack?.({ ok: true })
          await broadcastRoomState(io, roomId)
        })()
      },
    )

    // Fired when the host's receiver reports the current video ended: marks
    // it played (reusing the same queue service the manual "mark played"
    // flow uses) and hands back the next unplayed item for the host's
    // browser to load onto the Cast session.
    socket.on(SocketEvents.CastAdvance, (ack?: AdvanceAck) => {
      void (async () => {
        const { participantId, roomId } = socket.data
        if (!participantId || !roomId) {
          ack?.({ error: "Join a room first" })
          return
        }

        const participant = await prisma.participant.findUnique({
          where: { id: participantId },
        })
        if (!participant?.isHost) {
          ack?.({ error: "Only the host can advance the cast queue" })
          return
        }

        const current = await getCastState(roomId)
        if (current?.currentQueueItemId) {
          const found = await findQueueItemForPlayedToggle({
            queueItemId: current.currentQueueItemId,
            roomId,
            participantId,
            isHost: true,
            played: true,
          })
          if ("item" in found) {
            await commitQueueItemPlayed({
              queueItemId: found.item.id,
              roomId,
              played: true,
            })
          }
        }

        const state = await getRoomState(roomId)
        const next = state?.queue.find((item) => !item.playedAt) ?? null

        if (current) {
          await setCastState(roomId, {
            ...current,
            currentQueueItemId: next?.id ?? null,
            isPlaying: Boolean(next),
          })
        }

        ack?.({
          nextYoutubeVideoId: next?.youtubeVideoId ?? null,
          nextQueueItemId: next?.id ?? null,
        })
        await broadcastRoomState(io, roomId)
      })()
    })
  })
}
