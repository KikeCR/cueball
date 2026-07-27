import type { Server } from "socket.io"
import { redis } from "../redis/client.js"
import { getCastState, setCastState } from "../redis/castSession.js"
import {
  getLoungeSessionState,
  setLoungeSessionState,
} from "../redis/castLoungeSession.js"
import {
  commitQueueItemPlayed,
  findQueueItemForPlayedToggle,
} from "../services/queueService.js"
import { getRoomState } from "../services/roomService.js"
import { prisma } from "../services/prisma.js"
import {
  addVideoToLoungeQueue,
  getLoungeNowPlaying,
  setLoungePlaylist,
  type LoungeSessionState,
} from "../services/youtubeLounge.js"
import { broadcastRoomState } from "./broadcast.js"
import { withLoungeLock } from "./loungeLock.js"
import { notifyPlaylistSyncFailed } from "./playlistNotifications.js"
import { restartQueueIfRepeating } from "./queueRepeat.js"

const POLL_INTERVAL_MS = 2000
const LOUNGE_KEY_PATTERN = "room:*:lounge"

// A "stopped" report from the receiver might be a real end-of-video, or it
// might just be a brief blip (buffering, an ad, a quality change) while
// the same video is still actually playing fine. Acting on it right away
// would force a reload, which looks like a random pause. So we wait for
// it to show up twice in a row before believing it.
const STOP_CONFIRM_TICKS = 2
const pendingStopTicks = new Map<string, number>()

function roomIdFromLoungeKey(key: string): string | null {
  return /^room:(.+):lounge$/.exec(key)?.[1] ?? null
}

/**
 * The Cast SDK's own media session never populates for the real YouTube
 * receiver (it doesn't use the standard media protocol at all — see
 * youtubeLounge.ts), so there's no event to react to when a video starts,
 * ends, or gets skipped. This polls YouTube's Lounge API directly instead,
 * comparing whatever it reports as playing against this room's tracked
 * "current" queue item, and reconciles our own bookkeeping (mark played,
 * advance, broadcast) whenever they disagree — regardless of whether that
 * happened because a video simply finished or because someone hit skip.
 */
async function pollRoom(io: Server, roomId: string): Promise<void> {
  await withLoungeLock(roomId, () => reconcileRoom(io, roomId))
}

async function reconcileRoom(io: Server, roomId: string): Promise<void> {
  const lounge = await getLoungeSessionState(roomId)
  if (!lounge) return

  // Null here means no event arrived in this poll at all — try again next
  // tick. That's different from `nowPlaying.videoId` itself being null,
  // which means an event *did* arrive and it's explicitly reporting
  // nothing playing (see getLoungeNowPlaying's doc comment) — a real signal
  // this function needs to react to, not skip.
  const nowPlaying = await getLoungeNowPlaying(lounge)
  if (!nowPlaying) return

  const cast = await getCastState(roomId)
  if (!cast) return

  const roomState = await getRoomState(roomId)
  if (!roomState) return

  const currentItem = roomState.queue.find(
    (item) => item.id === cast.currentQueueItemId,
  )

  // Nothing to reconcile: still reporting the same video we already have
  // tracked, or (once idle) still reporting nothing, either way unchanged
  // since the last poll. Play/pause state is owned by the CastCommand
  // handler (the receiver doesn't reliably report it back), not by this
  // poller.
  if ((currentItem?.youtubeVideoId ?? null) === nowPlaying.videoId) {
    pendingStopTicks.delete(roomId)
    return
  }

  // Only a "stop" needs the extra confirmation tick. A change to a
  // different video, or a skip, is trusted right away since that's a real
  // signal, not just an absence of one.
  if (nowPlaying.videoId === null && currentItem) {
    const ticks = (pendingStopTicks.get(roomId) ?? 0) + 1
    if (ticks < STOP_CONFIRM_TICKS) {
      pendingStopTicks.set(roomId, ticks)
      return
    }
  }
  pendingStopTicks.delete(roomId)

  // The video changed — either it finished naturally and the receiver
  // auto-advanced into the next one on its own, a skip command landed, or
  // it ran out of its own queued videos and stopped (nowPlaying.videoId
  // null). Either way, mark whatever was playing before as played, the
  // same as the manual "mark played" flow does.
  if (currentItem) {
    const found = await findQueueItemForPlayedToggle({
      queueItemId: currentItem.id,
      roomId,
      participantId: cast.casterParticipantId ?? "",
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

  const room = await prisma.room.findUnique({ where: { id: roomId } })
  const restarted = room ? await restartQueueIfRepeating(room, roomId) : []

  if (nowPlaying.videoId === null) {
    // The receiver stopped on its own with nothing left in its live queue
    // to auto-advance into — it won't start playing again by itself. That
    // can mean the whole DB queue is genuinely empty (repeat may have just
    // refilled it, handled below), but it can just as easily mean there
    // ARE unplayed videos sitting in our queue that never actually made it
    // onto the receiver's own live queue in the first place — e.g. a vote
    // reorder or a fresh add whose push to the Lounge session silently
    // failed or hadn't landed yet. Falling back to whatever's still
    // unplayed (repeat's restarted lap taking priority when there is one)
    // means the receiver stopping is always treated as "figure out what
    // should play next," not just "was this a repeat restart" — otherwise
    // perfectly good, already-voted-for videos are left stranded with
    // nothing ever pushing them to the TV.
    const refreshedForFallback = await getRoomState(roomId)
    const stillUnplayed =
      refreshedForFallback?.queue.filter((item) => !item.playedAt) ?? []
    const upcoming = restarted.length > 0 ? restarted : stillUnplayed

    const [upNext, ...rest] = upcoming
    if (upNext) {
      // Pushing a whole lap back one video at a time is a handful of
      // sequential network round-trips to YouTube — long enough that the
      // room would otherwise look stalled with nothing playing and no
      // feedback. Flip this on before that loop starts so the UI can show
      // a loading state instead.
      await setCastState(roomId, { ...cast, restarting: true })
      await broadcastRoomState(io, roomId)

      let session: LoungeSessionState
      try {
        session = await setLoungePlaylist(lounge, upNext.youtubeVideoId)
      } catch (err) {
        console.error(
          `Failed to start playback while restarting the live Cast queue for room ${roomId}`,
          err,
        )
        await setCastState(roomId, { ...cast, restarting: false })
        await broadcastRoomState(io, roomId)
        notifyPlaylistSyncFailed(
          io,
          roomId,
          "Couldn't resume the TV's queue. Try skipping or reconnecting.",
        )
        return
      }

      for (const item of rest) {
        try {
          session = await addVideoToLoungeQueue(session, item.youtubeVideoId)
        } catch (err) {
          console.error(
            `Failed to add ${item.youtubeVideoId} to the live Cast queue for room ${roomId} while restarting`,
            err,
          )
        }
      }
      await setLoungeSessionState(roomId, session)
      await setCastState(roomId, {
        ...cast,
        currentQueueItemId: upNext.id,
        isPlaying: true,
        restarting: false,
      })
    } else {
      await setCastState(roomId, {
        ...cast,
        currentQueueItemId: null,
        isPlaying: false,
        restarting: false,
      })
    }
    await broadcastRoomState(io, roomId)
    return
  }

  // Ordinary case: the receiver auto-advanced into a new video on its own.
  const refreshedState = await getRoomState(roomId)
  const nextItem = refreshedState?.queue.find(
    (item) => item.youtubeVideoId === nowPlaying.videoId,
  )

  await setCastState(roomId, {
    ...cast,
    currentQueueItemId: nextItem?.id ?? null,
    isPlaying: true,
    restarting: false,
  })
  await broadcastRoomState(io, roomId)
}

/** Starts the background poll loop; call once at server startup. */
export function startCastLoungePolling(io: Server): void {
  let sweeping = false
  setInterval(() => {
    if (sweeping) return
    sweeping = true
    void (async () => {
      try {
        const keys = await redis.keys(LOUNGE_KEY_PATTERN)
        for (const key of keys) {
          const roomId = roomIdFromLoungeKey(key)
          if (!roomId) continue
          try {
            await pollRoom(io, roomId)
          } catch (err) {
            console.error(`Cast lounge poll failed for room ${roomId}`, err)
          }
        }
      } finally {
        sweeping = false
      }
    })()
  }, POLL_INTERVAL_MS)
}
