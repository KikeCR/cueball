import type { Server } from "socket.io"
import { redis } from "../redis/client.js"
import { getCastState, setCastState } from "../redis/castSession.js"
import { getLoungeSessionState } from "../redis/castLoungeSession.js"
import {
  commitQueueItemPlayed,
  findQueueItemForPlayedToggle,
} from "../services/queueService.js"
import { getRoomState } from "../services/roomService.js"
import { prisma } from "../services/prisma.js"
import { fetchVideoDurationSeconds } from "../services/youtube.js"
import { getLoungeNowPlaying } from "../services/youtubeLounge.js"
import { broadcastRoomState } from "./broadcast.js"
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
  const lounge = await getLoungeSessionState(roomId)
  if (!lounge) return

  const nowPlaying = await getLoungeNowPlaying(lounge)
  if (!nowPlaying?.videoId) return

  const cast = await getCastState(roomId)
  if (!cast) return

  const roomState = await getRoomState(roomId)
  if (!roomState) return

  const currentItem = roomState.queue.find(
    (item) => item.id === cast.currentQueueItemId,
  )

  if (currentItem?.youtubeVideoId === nowPlaying.videoId) {
    await setCastState(roomId, {
      ...cast,
      isPlaying: true,
      currentTimeSeconds: nowPlaying.currentTimeSeconds,
    })
    await broadcastRoomState(io, roomId)
    return
  }

  // The video changed — either it finished naturally and the receiver
  // auto-advanced into the next one on its own, or a skip command landed.
  // Either way, mark whatever was playing before as played, the same as
  // the manual "mark played" flow does.
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
      const room = await prisma.room.findUnique({ where: { id: roomId } })
      if (room) await restartQueueIfRepeating(room, roomId)
    }
  }

  const refreshedState = await getRoomState(roomId)
  const nextItem = refreshedState?.queue.find(
    (item) => item.youtubeVideoId === nowPlaying.videoId,
  )
  const durationSeconds = await fetchVideoDurationSeconds(
    nowPlaying.videoId,
  ).catch(() => null)

  await setCastState(roomId, {
    ...cast,
    currentQueueItemId: nextItem?.id ?? null,
    isPlaying: true,
    currentTimeSeconds: nowPlaying.currentTimeSeconds,
    durationSeconds,
  })
  await broadcastRoomState(io, roomId)
}

/** Starts the background poll loop; call once at server startup. */
export function startCastLoungePolling(io: Server): void {
  setInterval(() => {
    void (async () => {
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
    })()
  }, POLL_INTERVAL_MS)
}
