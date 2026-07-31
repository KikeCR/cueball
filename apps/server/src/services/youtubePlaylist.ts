import type { QueueItem, Room } from "@prisma/client"
import { recordYoutubeQuotaUsage } from "../redis/youtubeQuota.js"
import { prisma } from "./prisma.js"
import { resolveNowPlayingQueueItem, sortQueueItems } from "./roomService.js"
import { getAuthorizedYoutubeClient } from "./youtubeAuth.js"

// All four playlist write endpoints below cost 50 quota units per call
// (Google's documented flat cost for any playlists.* or playlistItems.*
// write) — unlike the ~1-5 units most read calls cost.
const QUOTA_COST_PLAYLIST_WRITE = 50

/**
 * Picks a user-facing reason for a failed YouTube playlist API call. The
 * default "check the connection" framing is actively misleading for quota
 * errors (a very common failure mode under any real testing/usage volume) —
 * those have nothing to do with the OAuth connection and self-resolve on
 * Google's own daily reset, so callers shouldn't be sent off to reconnect
 * YouTube for no reason.
 */
export function describeYoutubePlaylistError(err: unknown): string {
  const reason = (
    err as { errors?: Array<{ reason?: string }> } | undefined
  )?.errors?.[0]?.reason
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
    return "YouTube's daily API limit has been reached. This resets automatically — try again later."
  }
  if (reason === "SERVICE_UNAVAILABLE") {
    return "YouTube's playlist service is temporarily busy. Try again in a moment."
  }
  return "Ask the host to check their YouTube connection."
}

export async function createPlaylistForRoom(room: Room): Promise<string> {
  const youtube = getAuthorizedYoutubeClient(room)
  let res
  try {
    res = await youtube.playlists.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: room.name ?? `CueBall - ${room.code}`,
          description: "Synced live by CueBall (cueball watch-party app)",
        },
        status: { privacyStatus: "unlisted" },
      },
    })
  } finally {
    await recordYoutubeQuotaUsage(QUOTA_COST_PLAYLIST_WRITE)
  }

  const playlistId = res.data.id
  if (!playlistId) throw new Error("YouTube did not return a playlist id")

  await prisma.room.update({
    where: { id: room.id },
    data: { youtubePlaylistId: playlistId },
  })
  return playlistId
}

export async function addVideoToPlaylist(
  room: Room,
  queueItem: Pick<QueueItem, "id" | "youtubeVideoId">,
): Promise<void> {
  if (!room.youtubePlaylistId) return

  const youtube = getAuthorizedYoutubeClient(room)
  let res
  try {
    res = await youtube.playlistItems.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          playlistId: room.youtubePlaylistId,
          resourceId: {
            kind: "youtube#video",
            videoId: queueItem.youtubeVideoId,
          },
        },
      },
    })
  } finally {
    await recordYoutubeQuotaUsage(QUOTA_COST_PLAYLIST_WRITE)
  }

  const playlistItemId = res.data.id
  if (!playlistItemId) return
  await prisma.queueItem.update({
    where: { id: queueItem.id },
    data: { youtubePlaylistItemId: playlistItemId },
  })
}

export async function removeVideoFromPlaylist(
  room: Room,
  playlistItemId: string,
): Promise<void> {
  const youtube = getAuthorizedYoutubeClient(room)
  try {
    await youtube.playlistItems.delete({ id: playlistItemId })
  } finally {
    await recordYoutubeQuotaUsage(QUOTA_COST_PLAYLIST_WRITE)
  }
}

/** Deletes the real playlist itself (e.g. when the room it belongs to is deleted). */
export async function deletePlaylistForRoom(room: Room): Promise<void> {
  if (!room.youtubePlaylistId) return
  const youtube = getAuthorizedYoutubeClient(room)
  try {
    await youtube.playlists.delete({ id: room.youtubePlaylistId })
  } finally {
    await recordYoutubeQuotaUsage(QUOTA_COST_PLAYLIST_WRITE)
  }
}

/**
 * Naive full resync: fine for a demo-sized queue, would want move-diffing to
 * stay under quota at scale. Takes the order explicitly rather than reading
 * it from the DB, so a caller can confirm the real playlist accepts a
 * reorder *before* committing it in-app (see queueService's prepare/commit
 * split for reorder and remove).
 *
 * Updates are sent one at a time, not in parallel: YouTube's
 * playlistItems.update doesn't handle concurrent position writes to the
 * same playlist safely — sending them all at once reliably produces 409
 * Conflict / SERVICE_UNAVAILABLE responses instead of applying the reorder.
 */
export async function syncPlaylistOrderForItems(
  room: Room,
  orderedItems: Array<
    Pick<QueueItem, "id" | "youtubeVideoId" | "youtubePlaylistItemId">
  >,
): Promise<void> {
  if (!room.youtubePlaylistId) return
  const playlistId = room.youtubePlaylistId

  const syncedItems = orderedItems.filter(
    (item): item is typeof item & { youtubePlaylistItemId: string } =>
      item.youtubePlaylistItemId !== null,
  )
  if (syncedItems.length === 0) return

  const youtube = getAuthorizedYoutubeClient(room)
  for (const [index, item] of syncedItems.entries()) {
    try {
      await youtube.playlistItems.update({
        part: ["snippet"],
        requestBody: {
          id: item.youtubePlaylistItemId,
          snippet: {
            playlistId,
            position: index,
            resourceId: { kind: "youtube#video", videoId: item.youtubeVideoId },
          },
        },
      })
    } finally {
      await recordYoutubeQuotaUsage(QUOTA_COST_PLAYLIST_WRITE)
    }
  }
}

/** Resyncs the real playlist order from the DB's current score/position state (used by the debounced vote-driven sync). */
export async function syncPlaylistOrder(roomId: string): Promise<void> {
  const room = await prisma.room.findUnique({ where: { id: roomId } })
  if (!room?.youtubePlaylistId) return

  const allItems = await prisma.queueItem.findMany({ where: { roomId } })
  const nowPlayingQueueItemId = await resolveNowPlayingQueueItem({
    roomId,
    mode: room.mode,
    currentPinId: room.nowPlayingQueueItemId,
    unplayedItems: allItems.filter((item) => !item.playedAt),
  })
  const sortedItems = sortQueueItems(
    allItems,
    room.manualQueueOrder,
    nowPlayingQueueItemId,
  )
  await syncPlaylistOrderForItems(room, sortedItems)
}
