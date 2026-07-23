import type { Server } from "socket.io"
import {
  SocketEvents,
  type ActionError,
  type ActionOk,
  type QueueAddPayload,
  type QueueVotePayload,
} from "@cueball/shared"
import { addQueueItem, castVote } from "../services/queueService.js"
import { fetchVideoMetadata, parseYoutubeVideoId } from "../services/youtube.js"
import { prisma } from "../services/prisma.js"
import { addVideoToPlaylist } from "../services/youtubePlaylist.js"
import { broadcastRoomState } from "./broadcast.js"
import { schedulePlaylistSync } from "./playlistSync.js"
import type { RoomSocket } from "./types.js"

type Ack = (result: ActionOk | ActionError) => void

export function registerQueueHandlers(io: Server): void {
  io.on("connection", (socket: RoomSocket) => {
    socket.on(SocketEvents.QueueAdd, (payload: QueueAddPayload, ack?: Ack) => {
      void (async () => {
        const { participantId, roomId } = socket.data
        if (!participantId || !roomId) {
          ack?.({ error: "Join a room before adding videos" })
          return
        }

        // The queue only exists to feed the real playlist, so require that
        // connection before accepting adds rather than silently queuing
        // videos in-app that never make it to the TV.
        const room = await prisma.room.findUnique({ where: { id: roomId } })
        if (!room?.youtubePlaylistId) {
          ack?.({
            error: "Ask the host to connect YouTube before adding videos",
          })
          return
        }

        const videoId = parseYoutubeVideoId(payload.youtubeUrl ?? "")
        if (!videoId) {
          ack?.({ error: "That doesn't look like a YouTube link" })
          return
        }

        const metadata = await fetchVideoMetadata(videoId)
        if (!metadata) {
          ack?.({ error: "Couldn't find that video" })
          return
        }

        const queueItem = await addQueueItem({
          roomId,
          addedByParticipantId: participantId,
          youtubeVideoId: videoId,
          title: metadata.title,
          thumbnailUrl: metadata.thumbnailUrl,
        })

        ack?.({ ok: true })
        await broadcastRoomState(io, roomId)

        // Sync to the real playlist after the in-app queue already reflects
        // the add, so this network round-trip to Google doesn't delay the
        // instant in-room feedback.
        try {
          await addVideoToPlaylist(room, queueItem)
          await broadcastRoomState(io, roomId)
        } catch (err) {
          console.error(
            `Failed to sync new queue item to YouTube playlist for room ${roomId}`,
            err,
          )
        }
      })()
    })

    socket.on(
      SocketEvents.QueueVote,
      (payload: QueueVotePayload, ack?: Ack) => {
        void (async () => {
          const { participantId, roomId } = socket.data
          if (!participantId || !roomId) {
            ack?.({ error: "Join a room before voting" })
            return
          }

          if (payload.value !== 1 && payload.value !== -1) {
            ack?.({ error: "Invalid vote value" })
            return
          }

          await castVote({
            queueItemId: payload.queueItemId,
            participantId,
            value: payload.value,
          })

          ack?.({ ok: true })
          await broadcastRoomState(io, roomId)
          schedulePlaylistSync(roomId)
        })()
      },
    )
  })
}
