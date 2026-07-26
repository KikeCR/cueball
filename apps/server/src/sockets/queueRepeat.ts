import type { Room } from "@prisma/client"
import {
  commitQueueRepeatRestart,
  findRepeatRestartItems,
  type QueueItemWithVotes,
} from "../services/queueService.js"
import { addVideoToPlaylist } from "../services/youtubePlaylist.js"

/**
 * Called after marking a video played. If repeat is on and that was the
 * last unplayed item, re-adds the whole played history back onto the real
 * playlist — one at a time, since YouTube's playlistItems.insert doesn't
 * handle concurrent writes to the same playlist safely, same reason
 * syncPlaylistOrderForItems sends its updates one at a time — and only
 * resets items back to unplayed once they're confirmed back on the real
 * playlist. Anything that fails (e.g. quota) stays in played history rather
 * than the app claiming a state the real playlist doesn't have.
 *
 * Returns whatever actually got restarted (playedAt-ascending, so index 0
 * is what should play next), so a Cast-mode caller can push it onto the
 * live Lounge queue itself — resetting the DB back to unplayed doesn't make
 * a real YouTube playlist auto-play, and Cast rooms don't have one anyway.
 */
export async function restartQueueIfRepeating(
  room: Room,
  roomId: string,
): Promise<QueueItemWithVotes[]> {
  const restart = await findRepeatRestartItems({
    roomId,
    repeatEnabled: room.repeatEnabled,
  })
  if ("noop" in restart) return []

  const readyIds: string[] = []
  const ready: QueueItemWithVotes[] = []
  for (const item of restart.items) {
    if (!room.youtubePlaylistId) {
      readyIds.push(item.id)
      ready.push(item)
      continue
    }
    try {
      await addVideoToPlaylist(room, item)
      readyIds.push(item.id)
      ready.push(item)
    } catch (err) {
      console.error(
        `Failed to re-add video to YouTube playlist while repeating room ${roomId}`,
        err,
      )
    }
  }

  await commitQueueRepeatRestart({ roomId, queueItemIds: readyIds })
  return ready
}
