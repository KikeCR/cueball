import type { Server } from "socket.io"
import {
  MAX_VIDEO_DURATION_SECONDS,
  SocketEvents,
  type ActionError,
  type ActionOk,
  type QueueAddPayload,
  type QueueClearResult,
  type QueueRemovePayload,
  type QueueReorderPayload,
  type QueueSetPlayedPayload,
  type QueueVotePayload,
} from "@cueball/shared"
import {
  addQueueItem,
  castVote,
  commitQueueClear,
  commitQueueHistoryClear,
  commitQueueItemPlayed,
  commitQueueItemRemoval,
  commitQueueReorder,
  findClearableQueueItems,
  findQueueItemForPlayedToggle,
  findRemovableQueueItem,
  isVideoAlreadyQueued,
  prepareQueueReorder,
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
  describeYoutubePlaylistError,
  removeVideoFromPlaylist,
  syncPlaylistOrderForItems,
} from "../services/youtubePlaylist.js"
import { broadcastRoomState } from "./broadcast.js"
import { notifyPlaylistSyncFailed } from "./playlistNotifications.js"
import { schedulePlaylistSync } from "./playlistSync.js"
import { restartQueueIfRepeating } from "./queueRepeat.js"
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

        const room = await prisma.room.findUnique({ where: { id: roomId } })
        if (!room) {
          ack?.({ error: "Room not found" })
          return
        }
        // Playlist-sync rooms exist to feed a real YouTube playlist, so
        // require that connection before accepting adds rather than
        // silently queuing videos in-app that never make it to the TV.
        // Cast-mode rooms never have (or need) a playlist — the Cast SDK
        // loads videos directly by id — so this doesn't apply to them.
        if (room.mode !== "CAST" && !room.youtubePlaylistId) {
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
        // instant in-room feedback. Adding is high-frequency enough (and
        // low-stakes enough if it briefly lags) that it stays best-effort,
        // unlike reorder/remove/mark-played below.
        try {
          await addVideoToPlaylist(room, queueItem)
          await broadcastRoomState(io, roomId)
        } catch (err) {
          console.error(
            `Failed to sync new queue item to YouTube playlist for room ${roomId}`,
            err,
          )
          notifyPlaylistSyncFailed(
            io,
            roomId,
            `Couldn't add that video to the YouTube playlist. ${describeYoutubePlaylistError(err)}`,
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
          // Votes are frequent enough that gating each one on a live YouTube
          // round-trip would feel laggy, so this stays a debounced
          // best-effort background sync (with a visible failure notice)
          // rather than the confirm-before-commit flow used below.
          schedulePlaylistSync(io, roomId)
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

          const found = await findRemovableQueueItem({
            queueItemId: payload.queueItemId,
            roomId,
            participantId,
            isHost: participant.isHost,
          })
          if ("error" in found) {
            ack?.({ error: found.error })
            return
          }

          // Confirm the real playlist accepts the removal before touching
          // the in-app queue — otherwise a failure here would leave the
          // video gone from CueBall but still sitting in the actual
          // playlist, with no way to tell from the UI.
          if (found.item.youtubePlaylistItemId) {
            const room = await prisma.room.findUnique({ where: { id: roomId } })
            if (room?.youtubePlaylistId) {
              try {
                await removeVideoFromPlaylist(
                  room,
                  found.item.youtubePlaylistItemId,
                )
              } catch (err) {
                console.error(
                  `Failed to remove queue item from YouTube playlist for room ${roomId}`,
                  err,
                )
                ack?.({
                  error: `Couldn't remove that video from the YouTube playlist. ${describeYoutubePlaylistError(err)}`,
                })
                return
              }
            }
          }

          await commitQueueItemRemoval({ queueItemId: found.item.id, roomId })
          ack?.({ ok: true })
          await broadcastRoomState(io, roomId)
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

          const prepared = await prepareQueueReorder({
            roomId,
            isHost: participant.isHost,
            orderedQueueItemIds: payload.orderedQueueItemIds ?? [],
          })
          if ("error" in prepared) {
            ack?.({ error: prepared.error })
            return
          }

          // Confirm the real playlist accepts the new order before
          // committing it in-app — a drag that silently didn't land on
          // YouTube's side would otherwise look identical to one that did.
          const room = await prisma.room.findUnique({ where: { id: roomId } })
          if (room?.youtubePlaylistId) {
            try {
              await syncPlaylistOrderForItems(room, prepared.items)
            } catch (err) {
              console.error(
                `Failed to sync reordered queue to YouTube playlist for room ${roomId}`,
                err,
              )
              ack?.({
                error: `Couldn't update the YouTube playlist order. ${describeYoutubePlaylistError(err)}`,
              })
              return
            }
          }

          await commitQueueReorder({
            roomId,
            orderedQueueItemIds: payload.orderedQueueItemIds ?? [],
          })
          ack?.({ ok: true })
          await broadcastRoomState(io, roomId)
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

          const found = await findQueueItemForPlayedToggle({
            queueItemId: payload.queueItemId,
            roomId,
            participantId,
            isHost: participant.isHost,
            played: payload.played,
          })
          if ("error" in found) {
            ack?.({ error: found.error })
            return
          }

          // Confirm the matching real-playlist change lands first: marking
          // played is the whole mechanism that keeps an already-watched
          // video from replaying on the real playlist, so it can't be
          // allowed to silently "succeed" in-app while the real playlist
          // still has it.
          const room = await prisma.room.findUnique({ where: { id: roomId } })
          if (room?.youtubePlaylistId) {
            try {
              if (payload.played && found.item.youtubePlaylistItemId) {
                await removeVideoFromPlaylist(
                  room,
                  found.item.youtubePlaylistItemId,
                )
                await prisma.queueItem.update({
                  where: { id: found.item.id },
                  data: { youtubePlaylistItemId: null },
                })
              } else if (!payload.played && !found.item.youtubePlaylistItemId) {
                await addVideoToPlaylist(room, found.item)
              }
            } catch (err) {
              console.error(
                `Failed to sync played-state to YouTube playlist for room ${roomId}`,
                err,
              )
              ack?.({
                error: payload.played
                  ? `Couldn't remove that video from the YouTube playlist. ${describeYoutubePlaylistError(err)}`
                  : `Couldn't add that video back to the YouTube playlist. ${describeYoutubePlaylistError(err)}`,
              })
              return
            }
          }

          await commitQueueItemPlayed({
            queueItemId: found.item.id,
            roomId,
            played: payload.played,
          })

          if (payload.played && room) {
            await restartQueueIfRepeating(room, roomId)
          }

          ack?.({ ok: true })
          await broadcastRoomState(io, roomId)
        })()
      },
    )

    socket.on(
      SocketEvents.QueueClear,
      (ack?: (result: QueueClearResult | ActionError) => void) => {
        void (async () => {
          const { participantId, roomId } = socket.data
          if (!participantId || !roomId) {
            ack?.({ error: "Join a room before clearing the queue" })
            return
          }

          const participant = await prisma.participant.findUnique({
            where: { id: participantId },
          })
          if (!participant) {
            ack?.({ error: "Participant not found" })
            return
          }

          const found = await findClearableQueueItems({
            roomId,
            isHost: participant.isHost,
          })
          if ("error" in found) {
            ack?.({ error: found.error })
            return
          }

          const totalCount = found.items.length
          if (totalCount === 0) {
            ack?.({ clearedCount: 0, totalCount: 0 })
            return
          }

          // Clearing is a bulk op: rather than abort everything over one
          // flaky YouTube call (like single-item remove does), attempt
          // every real-playlist removal and only keep whichever items
          // fail in the queue — so the app never claims a video is gone
          // when it's still sitting in the actual playlist.
          let clearableIds = found.items.map((item) => item.id)
          const room = await prisma.room.findUnique({ where: { id: roomId } })
          if (room?.youtubePlaylistId) {
            const withPlaylistItem = found.items.filter(
              (item) => item.youtubePlaylistItemId,
            )
            const results = await Promise.allSettled(
              withPlaylistItem.map((item) =>
                removeVideoFromPlaylist(room, item.youtubePlaylistItemId!),
              ),
            )
            const failedIds = new Set<string>()
            results.forEach((result, index) => {
              const item = withPlaylistItem[index]
              if (result.status === "rejected" && item) {
                failedIds.add(item.id)
                console.error(
                  `Failed to remove queue item ${item.id} from YouTube playlist for room ${roomId}`,
                  result.reason,
                )
              }
            })
            clearableIds = found.items
              .filter((item) => !failedIds.has(item.id))
              .map((item) => item.id)
          }

          await commitQueueClear({ roomId, queueItemIds: clearableIds })
          ack?.({ clearedCount: clearableIds.length, totalCount })
          await broadcastRoomState(io, roomId)
        })()
      },
    )

    socket.on(SocketEvents.QueueClearHistory, (ack?: Ack) => {
      void (async () => {
        const { participantId, roomId } = socket.data
        if (!participantId || !roomId) {
          ack?.({ error: "Join a room before clearing history" })
          return
        }

        const participant = await prisma.participant.findUnique({
          where: { id: participantId },
        })
        if (!participant) {
          ack?.({ error: "Participant not found" })
          return
        }

        const result = await commitQueueHistoryClear({
          roomId,
          isHost: participant.isHost,
        })
        if ("error" in result) {
          ack?.({ error: result.error })
          return
        }

        ack?.({ ok: true })
        await broadcastRoomState(io, roomId)
      })()
    })
  })
}
