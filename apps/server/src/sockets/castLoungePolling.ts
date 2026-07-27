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
} from "../services/youtubeLounge.js"
import { broadcastRoomState } from "./broadcast.js"
import { withLoungeLock } from "./loungeLock.js"
import { restartQueueIfRepeating } from "./queueRepeat.js"

const POLL_INTERVAL_MS = 4000
const LOUNGE_KEY_PATTERN = "room:*:lounge"

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
  // The whole reconcile-and-possibly-mutate cycle runs under the lock, not
  // just the writes at the end — this is exactly the flow a vote-driven
  // resync (castQueueSync.ts) or a fresh add's immediate push (queue.ts)
  // can otherwise land in the middle of, e.g. right as a video finishes and
  // this is deciding what's playing next.
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
  if ((currentItem?.youtubeVideoId ?? null) === nowPlaying.videoId) return

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
    // to auto-advance into — it won't start playing again by itself, even
    // once repeat has reset the history back to unplayed in our DB. Push
    // the restarted lap onto the Lounge queue ourselves, the same way
    // bootstrapCastSession does when a Cast session first connects.
    const [upNext, ...rest] = restarted
    if (upNext) {
      // Pushing a whole lap back one video at a time is a handful of
      // sequential network round-trips to YouTube — long enough that the
      // room would otherwise look stalled with nothing playing and no
      // feedback. Flip this on before that loop starts so the UI can show
      // a loading state instead.
      await setCastState(roomId, { ...cast, restarting: true })
      await broadcastRoomState(io, roomId)

      let session = await setLoungePlaylist(lounge, upNext.youtubeVideoId)
      for (const item of rest) {
        session = await addVideoToLoungeQueue(session, item.youtubeVideoId)
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
  // A repeat-restart pushes a whole lap back onto the Lounge queue with one
  // sequential rebind+POST round-trip per video, which can easily take
  // longer than one poll interval. Without this guard, `setInterval` would
  // start a second sweep on top of a still-running one, and the two would
  // race on the same room's cast state and Lounge session — e.g. the second
  // sweep re-reading `cast.currentQueueItemId` before the first has updated
  // it, marking the same video played twice with a bogus later timestamp,
  // corrupting its place in the next repeat lap. Skipping an overlapping
  // tick instead just delays polling until the current sweep finishes.
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
