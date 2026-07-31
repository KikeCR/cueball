import type { Server } from "socket.io"
import { RoomMode } from "@prisma/client"
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
import { getRoomState, roomAllowsLongVideos } from "../services/roomService.js"
import {
  fetchVideoDurationSeconds,
  fetchVideoDurationsSeconds,
  fetchVideoMetadata,
  fetchVideoTagInfo,
  formatDurationClock,
  groupVideosByTagCluster,
  isLikelyDuplicateTitle,
  isYoutubeDataApiConfigured,
  looksLikeNonMusicContent,
  parseYoutubeVideoId,
  pickRandomSubset,
  searchYoutubeVideos,
  YoutubeQuotaExceededError,
  type YoutubeSearchResult,
} from "../services/youtube.js"
import {
  getCachedSearchResults,
  setCachedSearchResults,
} from "../redis/youtubeSearchCache.js"
import { isRelatedVideosQuotaHealthy } from "../redis/youtubeQuota.js"
import { setRelatedVideosState } from "../redis/relatedVideosSession.js"
import { prisma } from "../services/prisma.js"
import {
  addVideoToPlaylist,
  describeYoutubePlaylistError,
  removeVideoFromPlaylist,
  syncPlaylistOrderForItems,
} from "../services/youtubePlaylist.js"
import {
  addVideoToLoungeQueue,
  removeVideoFromLoungeQueue,
  setLoungePlaylist,
} from "../services/youtubeLounge.js"
import { getCastState, setCastState } from "../redis/castSession.js"
import {
  getLoungeSessionState,
  setLoungeSessionState,
} from "../redis/castLoungeSession.js"
import { broadcastRoomState } from "./broadcast.js"
import { scheduleCastQueueSync } from "./castQueueSync.js"
import { withLoungeLock } from "./loungeLock.js"
import { notifyPlaylistSyncFailed } from "./playlistNotifications.js"
import { schedulePlaylistSync } from "./playlistSync.js"
import { restartQueueIfRepeating } from "./queueRepeat.js"
import type { RoomSocket } from "./types.js"

type Ack = (result: ActionOk | ActionError) => void

// Independent of MAX_VIDEO_DURATION_SECONDS (the room's own, host-overridable
// long-video cap) — related-video suggestions stay short regardless of that
// setting, since they're unsolicited suggestions rather than something
// someone explicitly chose to add.
const MAX_RELATED_VIDEO_DURATION_SECONDS = 8 * 60

// Capped display count for related videos — the filtered candidate pool
// behind it can be much bigger (up to 25 per tag-cluster query), and
// pickRandomSubset resamples from that pool on every refresh, which is what
// makes clicking "Refresh" actually surface something different.
const RELATED_VIDEOS_DISPLAY_COUNT = 10

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
        if (room.mode !== RoomMode.CAST && !room.youtubePlaylistId) {
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

        // Skips the length lookup entirely when it wouldn't matter anyway —
        // saves a YouTube Data API quota call, not just the check itself.
        if (!(await roomAllowsLongVideos(room.hostUserId))) {
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

        // If a TV is already connected for this Cast-mode room, push the
        // new video into the live session instead of leaving it sitting in
        // the app queue until someone reconnects — either as the first
        // thing to play (nothing loaded yet) or appended to the receiver's
        // own live queue (something already is).
        if (room.mode === RoomMode.CAST) {
          try {
            await withLoungeLock(roomId, async () => {
              const lounge = await getLoungeSessionState(roomId)
              if (lounge) {
                const cast = await getCastState(roomId)
                if (cast?.currentQueueItemId) {
                  const updated = await addVideoToLoungeQueue(lounge, videoId)
                  await setLoungeSessionState(roomId, updated)
                } else {
                  const updated = await setLoungePlaylist(lounge, videoId)
                  await setLoungeSessionState(roomId, updated)
                  if (cast) {
                    await setCastState(roomId, {
                      ...cast,
                      currentQueueItemId: queueItem.id,
                      isPlaying: true,
                    })
                    await broadcastRoomState(io, roomId)
                  }
                }
              }
            })
          } catch (err) {
            console.error(
              `Failed to push new video to the live Cast session for room ${roomId}`,
              err,
            )
            notifyPlaylistSyncFailed(
              io,
              roomId,
              "Couldn't add that video to the TV's live queue.",
            )
          }
        }
      })()
    })

    // Triggered only by an explicit refresh click in the UI, never
    // automatically off queue changes — search.list costs 100 quota units
    // per call against a project-wide daily budget, so this can't run on
    // every add/remove without exhausting it after a handful of active
    // rooms.
    socket.on(SocketEvents.QueueRelated, (_payload: unknown, ack?: Ack) => {
      void (async () => {
        const { roomId } = socket.data
        if (!roomId) {
          ack?.({ error: "Join a room before requesting related videos" })
          return
        }

        if (!isYoutubeDataApiConfigured()) {
          ack?.({ error: "YouTube search isn't configured on this server" })
          return
        }

        // The frontend already hides this feature once quota runs low (see
        // /api/config's youtubeQuotaHealthy), but that's a page-load-time
        // snapshot — re-check here so a still-open tab can't keep spending
        // quota past the safety threshold between page loads.
        if (!(await isRelatedVideosQuotaHealthy())) {
          ack?.({
            error: "Related videos are temporarily unavailable to save YouTube API quota for search.",
          })
          return
        }

        const roomState = await getRoomState(roomId)
        if (!roomState) {
          ack?.({ error: "Room not found" })
          return
        }

        // Gated on the room's original creator's own opt-in (like the long-
        // video cap bypass), not the requesting participant's account — a
        // promoted host who isn't the original creator, or a guest, doesn't
        // change this room's behavior.
        if (!roomState.room.relatedVideosEnabled) {
          ack?.({ error: "Related videos aren't enabled for this room" })
          return
        }

        const seedVideoIds = [
          ...new Set(roomState.queue.map((item) => item.youtubeVideoId)),
        ]
        if (seedVideoIds.length === 0) {
          await setRelatedVideosState(roomId, [])
          ack?.({ ok: true })
          await broadcastRoomState(io, roomId)
          return
        }

        try {
          const tagInfo = await fetchVideoTagInfo(seedVideoIds)
          // A mixed-taste queue (city pop and indie rock, say) rarely has
          // anything in common across the whole thing — grouping by shared
          // tags first and searching each group separately means a mixed
          // queue still gets results targeted at each of its distinct
          // clusters, instead of one blended query that matches nothing.
          // Each group also carries whichever category its videos mostly
          // share (e.g. Music), so a music queue's results stay music
          // instead of surfacing interviews/reaction clips about the same
          // artist.
          const groups = groupVideosByTagCluster(tagInfo)

          const alreadyQueued = new Set(seedVideoIds)
          const seedTitles = tagInfo.map((video) => video.title)
          const merged = new Map<string, YoutubeSearchResult>()
          for (const { query, videoCategoryId } of groups) {
            let results = await getCachedSearchResults(query, videoCategoryId)
            if (!results) {
              try {
                results = await searchYoutubeVideos(query, { videoCategoryId })
                await setCachedSearchResults(query, results, videoCategoryId)
              } catch (err) {
                console.error(
                  `Failed to fetch a related-videos group for room ${roomId}`,
                  err,
                )
                // A quota rejection here means every remaining group would
                // fail the same way — no point burning more failed calls.
                // Any other error might just be that one group's problem.
                if (err instanceof YoutubeQuotaExceededError) break
                continue
              }
            }
            for (const result of results) {
              if (alreadyQueued.has(result.videoId)) continue
              // The search-query exclusions already push YouTube's own
              // ranking away from this stuff, but this catches whatever
              // still gets through — an interview or awards-show clip is
              // routinely categorized as Music too, so the category filter
              // alone doesn't reliably exclude it.
              if (looksLikeNonMusicContent(result)) continue
              // A popular song routinely has several re-uploads under
              // different video ids, so excluding by id alone still lets
              // through videos the room already has, just from a different
              // channel — this catches the same song by title instead,
              // whether it's already in the room or already picked up from
              // an earlier group this same refresh.
              const alreadyHaveTitle = [
                ...seedTitles,
                ...[...merged.values()].map((r) => r.title),
              ].some((title) => isLikelyDuplicateTitle(title, result.title))
              if (alreadyHaveTitle) continue
              merged.set(result.videoId, result)
            }
          }

          // search.list can't filter to an exact cutoff itself (its
          // videoDuration param is only bucketed — short/medium/long — and
          // none of those land on 8 minutes), so this checks the real
          // duration afterward and drops anything too long. One batched
          // call regardless of how many candidates there are; a video
          // missing from the result (lookup failed) is kept rather than
          // dropped, the same fail-open behavior as the queue-add duration
          // check.
          const durations = await fetchVideoDurationsSeconds([...merged.keys()])
          for (const [videoId, duration] of durations) {
            if (duration > MAX_RELATED_VIDEO_DURATION_SECONDS) merged.delete(videoId)
          }

          // Shared room state, not per-socket — everyone sees whatever the
          // last refresh (by anyone) found, the same way everyone already
          // sees the same queue.
          const selected = pickRandomSubset(
            [...merged.values()],
            RELATED_VIDEOS_DISPLAY_COUNT,
          )
          await setRelatedVideosState(roomId, selected)
          ack?.({ ok: true })
          await broadcastRoomState(io, roomId)
        } catch (err) {
          console.error(
            `Failed to fetch related videos for room ${roomId}`,
            err,
          )
          ack?.({ error: "Couldn't fetch related videos right now" })
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
          // rather than the confirm-before-commit flow used below. Both
          // calls are no-ops for the room mode they don't apply to.
          schedulePlaylistSync(io, roomId)
          scheduleCastQueueSync(io, roomId)
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

          const room = await prisma.room.findUnique({ where: { id: roomId } })

          // Confirm the real playlist accepts the removal before touching
          // the in-app queue — otherwise a failure here would leave the
          // video gone from CueBall but still sitting in the actual
          // playlist, with no way to tell from the UI.
          if (found.item.youtubePlaylistItemId && room?.youtubePlaylistId) {
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

          await commitQueueItemRemoval({ queueItemId: found.item.id, roomId })
          ack?.({ ok: true })
          await broadcastRoomState(io, roomId)

          // The receiver's own live queue only ever grows via addVideo (see
          // QueueAdd above) — removing here in the app doesn't remove it
          // from the TV's queue by itself, so without this a "removed"
          // video would still play when its turn comes on the TV. Not
          // relevant for whatever's currently playing, since that's
          // excluded from the removable set entirely (see QueueList's
          // excludeQueueItemId).
          if (room?.mode === RoomMode.CAST) {
            try {
              await withLoungeLock(roomId, async () => {
                const lounge = await getLoungeSessionState(roomId)
                if (lounge) {
                  const updated = await removeVideoFromLoungeQueue(
                    lounge,
                    found.item.youtubeVideoId,
                  )
                  await setLoungeSessionState(roomId, updated)
                }
              })
            } catch (err) {
              console.error(
                `Failed to remove video from the live Cast session for room ${roomId}`,
                err,
              )
              notifyPlaylistSyncFailed(
                io,
                roomId,
                "Couldn't remove that video from the TV's live queue.",
              )
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

          // A Cast-mode room's currently-playing item is tracked separately
          // (cast.currentQueueItemId) from "unplayed" — it's already on the
          // TV, not something waiting its turn, so it's excluded from
          // reordering entirely rather than being just another queue row.
          const room = await prisma.room.findUnique({ where: { id: roomId } })
          const cast = room?.mode === RoomMode.CAST ? await getCastState(roomId) : null

          const prepared = await prepareQueueReorder({
            roomId,
            isHost: participant.isHost,
            orderedQueueItemIds: payload.orderedQueueItemIds ?? [],
            excludeQueueItemId: cast?.currentQueueItemId ?? null,
          })
          if ("error" in prepared) {
            ack?.({ error: prepared.error })
            return
          }

          // Confirm the real playlist accepts the new order before
          // committing it in-app — a drag that silently didn't land on
          // YouTube's side would otherwise look identical to one that did.
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

          // The receiver's own live queue only ever grows via addVideo
          // (see QueueAdd above and CastSessionStarted in sockets/cast.ts)
          // — it has no reorder primitive — so reflecting a new order there
          // means dropping and re-adding everything except whatever's
          // currently playing, which is left untouched. Best-effort: the
          // in-app order is already correct regardless of whether this
          // lands.
          if (room?.mode === RoomMode.CAST) {
            try {
              await withLoungeLock(roomId, async () => {
                const lounge = await getLoungeSessionState(roomId)
                if (lounge) {
                  // prepared.items already excludes the currently-playing
                  // item (see excludeQueueItemId above), so this is exactly
                  // the receiver's "upcoming" queue.
                  //
                  // Best-effort per item, same reasoning as
                  // castQueueSync.ts's vote-driven resync: a single failed
                  // remove/add in this sequential chain of HTTP calls must
                  // not abort the rest of the batch, or the receiver can be
                  // left with some videos missing and others stuck in
                  // their old position regardless of the new order.
                  let session = lounge
                  for (const item of prepared.items) {
                    try {
                      session = await removeVideoFromLoungeQueue(
                        session,
                        item.youtubeVideoId,
                      )
                    } catch (err) {
                      console.error(
                        `Failed to remove ${item.youtubeVideoId} from the live Cast queue for room ${roomId} while reordering`,
                        err,
                      )
                    }
                  }
                  for (const item of prepared.items) {
                    try {
                      session = await addVideoToLoungeQueue(
                        session,
                        item.youtubeVideoId,
                      )
                    } catch (err) {
                      console.error(
                        `Failed to re-add ${item.youtubeVideoId} to the live Cast queue for room ${roomId} while reordering`,
                        err,
                      )
                    }
                  }
                  await setLoungeSessionState(roomId, session)
                }
              })
            } catch (err) {
              console.error(
                `Failed to sync reordered queue to the live Cast session for room ${roomId}`,
                err,
              )
              notifyPlaylistSyncFailed(
                io,
                roomId,
                "Couldn't update the TV's live queue order.",
              )
            }
          }
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

          // Un-marking played is how a Cast-mode room adds a video back to
          // the active queue (it has no manual "mark as played" button, so
          // this is the only path for it) — push it onto the live TV queue
          // too, the same as a fresh QueueAdd does, or it'd sit restored in
          // the app but never actually play again.
          if (!payload.played && room?.mode === RoomMode.CAST) {
            try {
              await withLoungeLock(roomId, async () => {
                const lounge = await getLoungeSessionState(roomId)
                if (lounge) {
                  const cast = await getCastState(roomId)
                  if (cast?.currentQueueItemId) {
                    const updated = await addVideoToLoungeQueue(
                      lounge,
                      found.item.youtubeVideoId,
                    )
                    await setLoungeSessionState(roomId, updated)
                  } else {
                    const updated = await setLoungePlaylist(
                      lounge,
                      found.item.youtubeVideoId,
                    )
                    await setLoungeSessionState(roomId, updated)
                    if (cast) {
                      await setCastState(roomId, {
                        ...cast,
                        currentQueueItemId: found.item.id,
                        isPlaying: true,
                      })
                      await broadcastRoomState(io, roomId)
                    }
                  }
                }
              })
            } catch (err) {
              console.error(
                `Failed to push restored video to the live Cast session for room ${roomId}`,
                err,
              )
              notifyPlaylistSyncFailed(
                io,
                roomId,
                "Couldn't add that video back to the TV's live queue.",
              )
            }
          }
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

          const room = await prisma.room.findUnique({ where: { id: roomId } })
          const cast = room?.mode === RoomMode.CAST ? await getCastState(roomId) : null

          const found = await findClearableQueueItems({
            roomId,
            isHost: participant.isHost,
            excludeQueueItemId: cast?.currentQueueItemId ?? null,
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
