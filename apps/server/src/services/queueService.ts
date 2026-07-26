import type {
  QueueItem as PrismaQueueItem,
  Vote as PrismaVote,
} from "@prisma/client"
import { prisma } from "./prisma.js"
import { touchRoomActivity } from "./roomService.js"

export type QueueItemWithVotes = PrismaQueueItem & { votes: PrismaVote[] }

/**
 * A video already sitting unplayed in the queue can't be added again; once
 * it's been played, re-adding it is just queuing it up for another watch.
 */
export async function isVideoAlreadyQueued(params: {
  roomId: string
  youtubeVideoId: string
}): Promise<boolean> {
  const existing = await prisma.queueItem.findFirst({
    where: {
      roomId: params.roomId,
      youtubeVideoId: params.youtubeVideoId,
      playedAt: null,
    },
    select: { id: true },
  })
  return existing !== null
}

export async function addQueueItem(params: {
  roomId: string
  addedByParticipantId: string
  youtubeVideoId: string
  title: string
  thumbnailUrl: string | null
}): Promise<QueueItemWithVotes> {
  const item = await prisma.$transaction(async (tx) => {
    const last = await tx.queueItem.aggregate({
      where: { roomId: params.roomId },
      _max: { position: true },
    })
    return tx.queueItem.create({
      data: {
        roomId: params.roomId,
        youtubeVideoId: params.youtubeVideoId,
        title: params.title,
        thumbnailUrl: params.thumbnailUrl,
        addedByParticipantId: params.addedByParticipantId,
        position: (last._max.position ?? -1) + 1,
      },
      include: { votes: true },
    })
  })
  await touchRoomActivity(params.roomId)
  return item
}

export type CastVoteResult = { item: QueueItemWithVotes } | { error: string }

/**
 * Casting the same vote twice removes it; casting the opposite vote flips it.
 *
 * Order is normally vote-driven. Once a host drag switches the room into
 * manual order, non-host votes are paused (they'd have no visible effect,
 * so better to reject than silently accept) until a host casts a vote,
 * which hands ordering back to the votes.
 */
export async function castVote(params: {
  queueItemId: string
  participantId: string
  isHost: boolean
  value: 1 | -1
}): Promise<CastVoteResult> {
  return prisma.$transaction(async (tx): Promise<CastVoteResult> => {
    const item = await tx.queueItem.findUnique({
      where: { id: params.queueItemId },
    })
    if (!item) {
      return { error: "Video not found in this room's queue" }
    }

    const room = await tx.room.findUnique({
      where: { id: item.roomId },
      select: { manualQueueOrder: true },
    })
    if (room?.manualQueueOrder && !params.isHost) {
      return {
        error: "The host set a custom order; only they can vote right now",
      }
    }

    const existing = await tx.vote.findUnique({
      where: {
        queueItemId_participantId: {
          queueItemId: params.queueItemId,
          participantId: params.participantId,
        },
      },
    })

    if (!existing) {
      await tx.vote.create({
        data: {
          queueItemId: params.queueItemId,
          participantId: params.participantId,
          value: params.value,
        },
      })
    } else if (existing.value === params.value) {
      await tx.vote.delete({ where: { id: existing.id } })
    } else {
      await tx.vote.update({
        where: { id: existing.id },
        data: { value: params.value },
      })
    }

    const votes = await tx.vote.findMany({
      where: { queueItemId: params.queueItemId },
    })
    const score = votes.reduce((sum, vote) => sum + vote.value, 0)

    const updated = await tx.queueItem.update({
      where: { id: params.queueItemId },
      data: { score },
      include: { votes: true },
    })

    if (room?.manualQueueOrder && params.isHost) {
      await tx.room.update({
        where: { id: item.roomId },
        data: { manualQueueOrder: false },
      })
    }

    return { item: updated }
  }).then(async (result) => {
    if ("item" in result) await touchRoomActivity(result.item.roomId)
    return result
  })
}

export type FindRemovableQueueItemResult =
  { item: QueueItemWithVotes } | { error: string }

/**
 * Looks up and authorizes a removal without deleting anything yet, so the
 * caller can confirm the real YouTube playlist accepts the removal first
 * (see commitQueueItemRemoval) — the in-app queue shouldn't say a video is
 * gone if it's still sitting in the actual playlist.
 */
export async function findRemovableQueueItem(params: {
  queueItemId: string
  roomId: string
  participantId: string
  isHost: boolean
}): Promise<FindRemovableQueueItemResult> {
  const item = await prisma.queueItem.findFirst({
    where: { id: params.queueItemId, roomId: params.roomId },
    include: { votes: true },
  })
  if (!item) {
    return { error: "Video not found in this room's queue" }
  }
  if (item.addedByParticipantId !== params.participantId && !params.isHost) {
    return {
      error: "Only the person who added this, or the host, can remove it",
    }
  }
  return { item }
}

/** Deletes a queue item already confirmed removable. */
export async function commitQueueItemRemoval(params: {
  queueItemId: string
  roomId: string
}): Promise<void> {
  await prisma.queueItem.delete({ where: { id: params.queueItemId } })
  await touchRoomActivity(params.roomId)
}

export type FindQueueItemForPlayedToggleResult =
  { item: QueueItemWithVotes } | { error: string }

/**
 * Looks up and authorizes a played/unplayed toggle without applying it yet
 * — the caller confirms the matching real-playlist change (remove when
 * marking played, re-add when un-marking) lands first.
 */
export async function findQueueItemForPlayedToggle(params: {
  queueItemId: string
  roomId: string
  participantId: string
  isHost: boolean
  played: boolean
}): Promise<FindQueueItemForPlayedToggleResult> {
  const item = await prisma.queueItem.findFirst({
    where: { id: params.queueItemId, roomId: params.roomId },
    include: { votes: true },
  })
  if (!item) {
    return { error: "Video not found in this room's queue" }
  }
  if (item.addedByParticipantId !== params.participantId && !params.isHost) {
    return {
      error: "Only the person who added this, or the host, can mark it played",
    }
  }

  // Un-marking moves it back into the active queue, so it's subject to the
  // same no-duplicates rule as adding a video fresh (a separately re-added
  // copy could already be sitting there unplayed).
  if (!params.played) {
    const duplicate = await isVideoAlreadyQueued({
      roomId: params.roomId,
      youtubeVideoId: item.youtubeVideoId,
    })
    if (duplicate) {
      return { error: "That video is already in the queue" }
    }
  }

  return { item }
}

/** Applies a played/unplayed toggle already confirmed against the real playlist. */
export async function commitQueueItemPlayed(params: {
  queueItemId: string
  roomId: string
  played: boolean
}): Promise<QueueItemWithVotes> {
  const updated = await prisma.queueItem.update({
    where: { id: params.queueItemId },
    data: { playedAt: params.played ? new Date() : null },
    include: { votes: true },
  })
  await touchRoomActivity(params.roomId)
  return updated
}

export type PrepareQueueReorderResult =
  { items: QueueItemWithVotes[] } | { error: string }

/**
 * Only the host may manually reorder the queue. `orderedQueueItemIds` must
 * be exactly the room's current *unplayed* items, just reshuffled — a stale
 * client (someone added/removed/played a video mid-drag) is rejected rather
 * than silently dropping or duplicating items.
 *
 * Returns the full item rows in the requested order without writing
 * anything yet, so the caller can confirm the real playlist accepts the new
 * order (via syncPlaylistOrderForItems) before calling commitQueueReorder —
 * the in-app order shouldn't claim to be set if the real playlist disagrees.
 */
export async function prepareQueueReorder(params: {
  roomId: string
  isHost: boolean
  orderedQueueItemIds: string[]
}): Promise<PrepareQueueReorderResult> {
  if (!params.isHost) {
    return { error: "Only the host can reorder the queue" }
  }

  const current = await prisma.queueItem.findMany({
    where: { roomId: params.roomId, playedAt: null },
    include: { votes: true },
  })
  const currentIds = new Set(current.map((item) => item.id))
  const givenIds = new Set(params.orderedQueueItemIds)
  const isSameSet =
    currentIds.size === givenIds.size &&
    [...currentIds].every((id) => givenIds.has(id))
  if (!isSameSet) {
    return { error: "Queue changed, please try again" }
  }

  const byId = new Map(current.map((item) => [item.id, item]))
  const items = params.orderedQueueItemIds.map((id) => byId.get(id)!)
  return { items }
}

/** Persists a reorder already confirmed against the real playlist. */
export async function commitQueueReorder(params: {
  roomId: string
  orderedQueueItemIds: string[]
}): Promise<void> {
  await prisma.$transaction([
    ...params.orderedQueueItemIds.map((id, index) =>
      prisma.queueItem.update({ where: { id }, data: { position: index } }),
    ),
    prisma.room.update({
      where: { id: params.roomId },
      data: { manualQueueOrder: true },
    }),
  ])
  await touchRoomActivity(params.roomId)
}

export type FindClearableQueueItemsResult =
  { items: QueueItemWithVotes[] } | { error: string }

/**
 * Only the host may clear the queue. Returns the room's current unplayed
 * items without deleting anything yet, so the caller can attempt the
 * matching real-playlist removals first (playlist-mode rooms) and only
 * commit deletions for the items that actually succeeded there.
 */
export async function findClearableQueueItems(params: {
  roomId: string
  isHost: boolean
}): Promise<FindClearableQueueItemsResult> {
  if (!params.isHost) {
    return { error: "Only the host can clear the queue" }
  }
  const items = await prisma.queueItem.findMany({
    where: { roomId: params.roomId, playedAt: null },
    include: { votes: true },
  })
  return { items }
}

/** Deletes the given (already confirmed) queue items — a subset of findClearableQueueItems's result if any failed to clear from the real playlist. */
export async function commitQueueClear(params: {
  roomId: string
  queueItemIds: string[]
}): Promise<void> {
  if (params.queueItemIds.length === 0) return
  await prisma.queueItem.deleteMany({
    where: { id: { in: params.queueItemIds } },
  })
  await touchRoomActivity(params.roomId)
}

export type FindRepeatRestartItemsResult =
  { items: QueueItemWithVotes[] } | { noop: true }

/**
 * When repeat is on and marking a video played leaves nothing left to play,
 * the whole watched history becomes the next lap instead of leaving the room
 * empty. Returns the played items, oldest-played first (so the repeat lap
 * replays in the same order they were first watched), without resetting
 * anything yet — the caller re-adds each to the real playlist first (see
 * commitQueueRepeatRestart), the same confirm-before-commit shape used
 * elsewhere in this file.
 */
export async function findRepeatRestartItems(params: {
  roomId: string
  repeatEnabled: boolean
}): Promise<FindRepeatRestartItemsResult> {
  if (!params.repeatEnabled) return { noop: true }

  const remaining = await prisma.queueItem.count({
    where: { roomId: params.roomId, playedAt: null },
  })
  if (remaining > 0) return { noop: true }

  const items = await prisma.queueItem.findMany({
    where: { roomId: params.roomId, playedAt: { not: null } },
    include: { votes: true },
    orderBy: { playedAt: "asc" },
  })
  if (items.length === 0) return { noop: true }

  return { items }
}

/**
 * Resets the given (already confirmed against the real playlist) items back
 * to unplayed — a subset of findRepeatRestartItems's result if any failed to
 * re-add to the real playlist.
 */
export async function commitQueueRepeatRestart(params: {
  roomId: string
  queueItemIds: string[]
}): Promise<void> {
  if (params.queueItemIds.length === 0) return
  await prisma.queueItem.updateMany({
    where: { id: { in: params.queueItemIds } },
    data: { playedAt: null },
  })
  await touchRoomActivity(params.roomId)
}

/**
 * Clears played history. No real-playlist sync needed — a played item's
 * youtubePlaylistItemId is already cleared when it was marked played, so
 * history never references anything still on the real playlist.
 */
export async function commitQueueHistoryClear(params: {
  roomId: string
  isHost: boolean
}): Promise<{ clearedCount: number } | { error: string }> {
  if (!params.isHost) {
    return { error: "Only the host can clear played history" }
  }
  const result = await prisma.queueItem.deleteMany({
    where: { roomId: params.roomId, playedAt: { not: null } },
  })
  await touchRoomActivity(params.roomId)
  return { clearedCount: result.count }
}
