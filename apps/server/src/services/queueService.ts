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

export type RemoveQueueItemResult =
  { removed: QueueItemWithVotes } | { error: string }

/** Only the participant who added a video, or the host, may remove it. */
export async function removeQueueItem(params: {
  queueItemId: string
  roomId: string
  participantId: string
  isHost: boolean
}): Promise<RemoveQueueItemResult> {
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

  await prisma.queueItem.delete({ where: { id: item.id } })
  await touchRoomActivity(params.roomId)
  return { removed: item }
}

export type SetQueueItemPlayedResult =
  { item: QueueItemWithVotes } | { error: string }

/** Only the participant who added a video, or the host, may mark it played/unplayed. */
export async function setQueueItemPlayed(params: {
  queueItemId: string
  roomId: string
  participantId: string
  isHost: boolean
  played: boolean
}): Promise<SetQueueItemPlayedResult> {
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

  const updated = await prisma.queueItem.update({
    where: { id: item.id },
    data: { playedAt: params.played ? new Date() : null },
    include: { votes: true },
  })
  await touchRoomActivity(params.roomId)
  return { item: updated }
}

export type ReorderQueueResult = { ok: true } | { error: string }

/**
 * Only the host may manually reorder the queue. `orderedQueueItemIds` must
 * be exactly the room's current queue items, just reshuffled — a stale
 * client (someone added/removed a video mid-drag) is rejected rather than
 * silently dropping or duplicating items.
 */
export async function reorderQueue(params: {
  roomId: string
  isHost: boolean
  orderedQueueItemIds: string[]
}): Promise<ReorderQueueResult> {
  if (!params.isHost) {
    return { error: "Only the host can reorder the queue" }
  }

  const current = await prisma.queueItem.findMany({
    where: { roomId: params.roomId },
    select: { id: true },
  })
  const currentIds = new Set(current.map((item) => item.id))
  const givenIds = new Set(params.orderedQueueItemIds)
  const isSameSet =
    currentIds.size === givenIds.size &&
    [...currentIds].every((id) => givenIds.has(id))
  if (!isSameSet) {
    return { error: "Queue changed, please try again" }
  }

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
  return { ok: true }
}
