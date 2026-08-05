import type { Server } from "socket.io"
import { redis } from "../redis/client.js"
import { clearCastState, getCastState, setCastState } from "../redis/castSession.js"
import {
  clearLoungeSessionState,
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
  LOUNGE_STATE_PAUSED,
  sendLoungeTransportCommand,
  setLoungePlaylist,
  type LoungeSessionState,
} from "../services/youtubeLounge.js"
import { broadcastRoomState } from "./broadcast.js"
import { withLoungeLock } from "./loungeLock.js"
import { notifyPlaylistSyncFailed } from "./playlistNotifications.js"
import { restartQueueIfRepeating } from "./queueRepeat.js"

// Exported so castQueueSync.ts's debounce can stay safely longer than this
// — a vote-driven queue resync that fires before the poller has had a
// chance to notice the receiver already moved to a new video would read a
// stale `currentQueueItemId`, fail to exclude the video actually playing
// right now from the reorder, and remove-then-re-add it like any other
// queued item — which is exactly what makes a real, actively-playing video
// skip.
export const POLL_INTERVAL_MS = 2000
const LOUNGE_KEY_PATTERN = "room:*:lounge"

// A "stopped" report from the receiver might be a real end-of-video, or it
// might just be a brief blip (buffering, an ad, a quality change) while
// the same video is still actually playing fine. Acting on it right away
// would force a reload, which looks like a random pause. So we wait for
// it to show up twice in a row before believing it.
const STOP_CONFIRM_TICKS = 2
const pendingStopTicks = new Map<string, number>()

// A single failed bind request can just be a network blip on our end, not
// the receiver actually being gone — a real dead session (TV app closed)
// fails every subsequent request, so this only needs to rule out transient
// hiccups, not wait out anything the receiver itself is doing. 10 ticks at
// POLL_INTERVAL_MS is 20 seconds of sustained failure before believing it.
const DISCONNECT_CONFIRM_TICKS = 10
const pendingDisconnectTicks = new Map<string, number>()

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
export async function pollRoom(io: Server, roomId: string): Promise<void> {
  await withLoungeLock(roomId, () => reconcileRoom(io, roomId))
}

/**
 * Sends an explicit play command, but only once we've actually observed the
 * receiver reporting itself paused — not unconditionally after every load.
 * setPlaylist doesn't reliably auto-start playback on its own, but blindly
 * sending play regardless of real state risks colliding with a video that
 * already started fine on its own, which is a very plausible way to end up
 * with videos that intermittently pause themselves for no visible reason.
 */
async function resumeIfPaused(
  roomId: string,
  lounge: LoungeSessionState,
  state: string | null,
): Promise<void> {
  if (state !== LOUNGE_STATE_PAUSED) return
  try {
    const updated = await sendLoungeTransportCommand(lounge, "play")
    await setLoungeSessionState(roomId, updated)
  } catch (err) {
    console.error(`Failed to resume paused playback for room ${roomId}`, err)
  }
}

async function reconcileRoom(io: Server, roomId: string): Promise<void> {
  const lounge = await getLoungeSessionState(roomId)
  if (!lounge) return

  const result = await getLoungeNowPlaying(lounge)

  if (!result.reachable) {
    const ticks = (pendingDisconnectTicks.get(roomId) ?? 0) + 1
    if (ticks < DISCONNECT_CONFIRM_TICKS) {
      pendingDisconnectTicks.set(roomId, ticks)
      return
    }
    // Sustained failure, not a blip — the receiver's session is actually
    // gone (e.g. the TV's YouTube app was closed). Clear our side so the
    // room stops claiming to be connected and stops burning API calls
    // polling a session that will never respond again.
    pendingDisconnectTicks.delete(roomId)
    pendingStopTicks.delete(roomId)
    await clearCastState(roomId)
    await clearLoungeSessionState(roomId)
    await broadcastRoomState(io, roomId)
    return
  }
  pendingDisconnectTicks.delete(roomId)

  // Null here means no event arrived in this poll at all — try again next
  // tick. That's different from `nowPlaying.videoId` itself being null,
  // which means an event *did* arrive and it's explicitly reporting
  // nothing playing (see getLoungeNowPlaying's doc comment) — a real signal
  // this function needs to react to, not skip.
  const nowPlaying = result.nowPlaying
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
  // poller. The one exception is a video we were still waiting on (see
  // "restarting" below) actually catching up to what we already thought
  // was playing — that still needs to confirm it and clear the loading
  // state, even though nothing looks different by video id.
  if ((currentItem?.youtubeVideoId ?? null) === nowPlaying.videoId) {
    pendingStopTicks.delete(roomId)
    if (cast.restarting && nowPlaying.videoId !== null) {
      await resumeIfPaused(roomId, lounge, nowPlaying.state)
      await setCastState(roomId, { ...cast, isPlaying: true, restarting: false })
      await broadcastRoomState(io, roomId)
    }
    return
  }

  // We already told the receiver what to load and it just hasn't caught up
  // yet — a still-null status here doesn't mean anything new happened, the
  // TV is just buffering. Leave the loading indicator up and wait for a
  // later tick to pick up once it actually starts (handled further down as
  // an ordinary "moved to a new video" case). Without this, every tick
  // spent buffering would look like a fresh stop and re-send the same
  // "play this" command over and over, which only makes the wait longer.
  if (nowPlaying.videoId === null && cast.restarting) return

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

  if (nowPlaying.videoId !== null) {
    // The receiver moved to a video on its own — normally because ours
    // just finished and it auto-advanced. If that lands on something
    // actually in our queue, trust it, same as always. If it doesn't match
    // anything we queued, the receiver's own native "what plays next"
    // logic won by default (observed: a YouTube Mix still running from
    // before the TV was ever paired can auto-advance into more of itself
    // this way, even though clearing it and loading our first video at
    // connect time looked like it had fully taken over — clearing/loading
    // apparently doesn't reset whatever the receiver uses to decide what
    // to auto-play next). Don't just accept losing control of the room:
    // force-correct onto our own next unplayed item below, the same path
    // used when the receiver stops outright.
    const refreshedState = await getRoomState(roomId)
    const nextItem = refreshedState?.queue.find(
      (item) => item.youtubeVideoId === nowPlaying.videoId,
    )
    if (nextItem) {
      await resumeIfPaused(roomId, lounge, nowPlaying.state)
      await setCastState(roomId, {
        ...cast,
        currentQueueItemId: nextItem.id,
        isPlaying: true,
        restarting: false,
      })
      await broadcastRoomState(io, roomId)
      return
    }
  }

  // The receiver stopped on its own with nothing left in its live queue to
  // auto-advance into, or (see above) drifted into something we never
  // queued. Either way, it won't correct itself — that can mean the whole
  // DB queue is genuinely empty (repeat may have just refilled it, handled
  // below), but it can just as easily mean there ARE unplayed videos
  // sitting in our queue that never actually made it onto the receiver's
  // own live queue in the first place — e.g. a vote reorder or a fresh add
  // whose push to the Lounge session silently failed or hadn't landed yet.
  // Falling back to whatever's still unplayed (repeat's restarted lap
  // taking priority when there is one) means this is always treated as
  // "figure out what should actually play next," not just "was this a
  // repeat restart" — otherwise perfectly good, already-voted-for videos
  // are left stranded with nothing ever pushing them to the TV.
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

    // We've told the receiver to load upNext, but it can take a while to
    // actually start playing on its end (buffering, cold start after
    // sitting idle) — sending the command isn't the same as it actually
    // playing. So we track which video we're waiting on without marking
    // it playing yet. restarting stays true, and the next poll's normal
    // "receiver moved to a new video" handling further up is what confirms
    // it really started and clears the loading state — keeping the
    // loading indicator honestly in sync with the TV instead of the app
    // jumping ahead of it.
    await setCastState(roomId, {
      ...cast,
      currentQueueItemId: upNext.id,
      isPlaying: false,
      restarting: true,
    })
    await broadcastRoomState(io, roomId)

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
    return
  }

  await setCastState(roomId, {
    ...cast,
    currentQueueItemId: null,
    isPlaying: false,
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
        // In parallel, not sequentially: each room's poll is already
        // serialized against everything else touching that same room via
        // withLoungeLock (a per-room lock, so there's no cross-room
        // contention here) — polling rooms one at a time meant every
        // room's real poll cadence degraded the more concurrent Cast
        // sessions were active, since each one's `getLoungeNowPlaying`
        // long-poll request adds to the same tick before the next room
        // even starts. castQueueSync.ts's debounce is sized assuming
        // POLL_INTERVAL_MS reflects how fresh `currentQueueItemId` actually
        // is — a degraded cadence widens that race back open.
        await Promise.all(
          keys.map(async (key) => {
            const roomId = roomIdFromLoungeKey(key)
            if (!roomId) return
            try {
              await pollRoom(io, roomId)
            } catch (err) {
              console.error(`Cast lounge poll failed for room ${roomId}`, err)
            }
          }),
        )
      } finally {
        sweeping = false
      }
    })()
  }, POLL_INTERVAL_MS)
}
