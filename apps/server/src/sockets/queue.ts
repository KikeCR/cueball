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
import { broadcastRoomState } from "./broadcast.js"
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

        await addQueueItem({
          roomId,
          addedByParticipantId: participantId,
          youtubeVideoId: videoId,
          title: metadata.title,
          thumbnailUrl: metadata.thumbnailUrl,
        })

        ack?.({ ok: true })
        await broadcastRoomState(io, roomId)
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
        })()
      },
    )
  })
}
