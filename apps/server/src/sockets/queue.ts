import type { Server } from "socket.io"
import {
  MAX_VIDEO_DURATION_SECONDS,
  SocketEvents,
  type ActionError,
  type ActionOk,
  type QueueAddPayload,
  type QueueRemovePayload,
  type QueueReorderPayload,
  type QueueSetPlayedPayload,
  type QueueVotePayload,
} from "@cueball/shared"
import {
  addQueueItem,
  castVote,
  isVideoAlreadyQueued,
  removeQueueItem,
  reorderQueue,
  setQueueItemPlayed,
} from "../services/queueService.js"
import {
  fetchVideoDurationSeconds,
  fetchVideoMetadata,
  formatDurationClock,
  parseYoutubeVideoId,
} from "../services/youtube.js"
import { prisma } from "../services/prisma.js"
import {
  addVideoToPlaylist,
  removeVideoFromPlaylist,
} from "../services/youtubePlaylist.js"
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

        if (await isVideoAlreadyQueued({ roomId, youtubeVideoId: videoId })) {
          ack?.({ error: "That video is already in the queue" })
          return
        }

        const metadata = await fetchVideoMetadata(videoId)
        if (!metadata) {
          ack?.({ error: "Couldn't find that video" })
          return
        }

        const durationSeconds = await fetchVideoDurationSeconds(videoId)
        if (
          durationSeconds !== null &&
          durationSeconds > MAX_VIDEO_DURATION_SECONDS
        ) {
          ack?.({
            error: `Videos must be ${MAX_VIDEO_DURATION_SECONDS / 60} minutes or shorter (this one is ${formatDurationClock(durationSeconds)})`,
          })
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

          const participant = await prisma.participant.findUnique({
            where: { id: participantId },
          })
          if (!participant) {
            ack?.({ error: "Participant not found" })
            return
          }

          const result = await castVote({
            queueItemId: payload.queueItemId,
            participantId,
            isHost: participant.isHost,
            value: payload.value,
          })
          if ("error" in result) {
            ack?.({ error: result.error })
            return
          }

          ack?.({ ok: true })
          await broadcastRoomState(io, roomId)
          // Votes drive order by default (and a host vote can hand order
          // back to the votes out of manual drag-order mode), so the real
          // playlist may need to catch up either way.
          schedulePlaylistSync(roomId)
        })()
      },
    )

    socket.on(
      SocketEvents.QueueRemove,
      (payload: QueueRemovePayload, ack?: Ack) => {
        void (async () => {
          const { participantId, roomId } = socket.data
          if (!participantId || !roomId) {
            ack?.({ error: "Join a room before removing videos" })
            return
          }

          const participant = await prisma.participant.findUnique({
            where: { id: participantId },
          })
          if (!participant) {
            ack?.({ error: "Participant not found" })
            return
          }

          const result = await removeQueueItem({
            queueItemId: payload.queueItemId,
            roomId,
            participantId,
            isHost: participant.isHost,
          })
          if ("error" in result) {
            ack?.({ error: result.error })
            return
          }

          ack?.({ ok: true })
          await broadcastRoomState(io, roomId)

          if (result.removed.youtubePlaylistItemId) {
            const room = await prisma.room.findUnique({ where: { id: roomId } })
            if (room?.youtubePlaylistId) {
              try {
                await removeVideoFromPlaylist(
                  room,
                  result.removed.youtubePlaylistItemId,
                )
              } catch (err) {
                console.error(
                  `Failed to remove queue item from YouTube playlist for room ${roomId}`,
                  err,
                )
              }
            }
          }
        })()
      },
    )

    socket.on(
      SocketEvents.QueueReorder,
      (payload: QueueReorderPayload, ack?: Ack) => {
        void (async () => {
          const { participantId, roomId } = socket.data
          if (!participantId || !roomId) {
            ack?.({ error: "Join a room before reordering the queue" })
            return
          }

          const participant = await prisma.participant.findUnique({
            where: { id: participantId },
          })
          if (!participant) {
            ack?.({ error: "Participant not found" })
            return
          }

          const result = await reorderQueue({
            roomId,
            isHost: participant.isHost,
            orderedQueueItemIds: payload.orderedQueueItemIds ?? [],
          })
          if ("error" in result) {
            ack?.({ error: result.error })
            return
          }

          ack?.({ ok: true })
          await broadcastRoomState(io, roomId)
          schedulePlaylistSync(roomId)
        })()
      },
    )

    socket.on(
      SocketEvents.QueueSetPlayed,
      (payload: QueueSetPlayedPayload, ack?: Ack) => {
        void (async () => {
          const { participantId, roomId } = socket.data
          if (!participantId || !roomId) {
            ack?.({ error: "Join a room before marking videos played" })
            return
          }

          const participant = await prisma.participant.findUnique({
            where: { id: participantId },
          })
          if (!participant) {
            ack?.({ error: "Participant not found" })
            return
          }

          const result = await setQueueItemPlayed({
            queueItemId: payload.queueItemId,
            roomId,
            participantId,
            isHost: participant.isHost,
            played: payload.played,
          })
          if ("error" in result) {
            ack?.({ error: result.error })
            return
          }

          ack?.({ ok: true })
          await broadcastRoomState(io, roomId)

          // Keep the real playlist in sync: a played video is pulled off it
          // so driving the TV straight from YouTube can't replay it;
          // unmarking re-adds it (appended, not restored to its old spot).
          const room = await prisma.room.findUnique({ where: { id: roomId } })
          if (!room?.youtubePlaylistId) return

          try {
            if (payload.played && result.item.youtubePlaylistItemId) {
              await removeVideoFromPlaylist(
                room,
                result.item.youtubePlaylistItemId,
              )
              await prisma.queueItem.update({
                where: { id: result.item.id },
                data: { youtubePlaylistItemId: null },
              })
              await broadcastRoomState(io, roomId)
            } else if (!payload.played && !result.item.youtubePlaylistItemId) {
              await addVideoToPlaylist(room, result.item)
              await broadcastRoomState(io, roomId)
            }
          } catch (err) {
            console.error(
              `Failed to sync played-state to YouTube playlist for room ${roomId}`,
              err,
            )
          }
        })()
      },
    )
  })
}
