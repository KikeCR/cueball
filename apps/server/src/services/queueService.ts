import type {
  QueueItem as PrismaQueueItem,
  Vote as PrismaVote,
} from "@prisma/client"
import { prisma } from "./prisma.js"

export type QueueItemWithVotes = PrismaQueueItem & { votes: PrismaVote[] }

export async function addQueueItem(params: {
  roomId: string
  addedByParticipantId: string
  youtubeVideoId: string
  title: string
  thumbnailUrl: string | null
}): Promise<QueueItemWithVotes> {
  return prisma.queueItem.create({
    data: {
      roomId: params.roomId,
      youtubeVideoId: params.youtubeVideoId,
      title: params.title,
      thumbnailUrl: params.thumbnailUrl,
      addedByParticipantId: params.addedByParticipantId,
    },
    include: { votes: true },
  })
}

/** Casting the same vote twice removes it; casting the opposite vote flips it. */
export async function castVote(params: {
  queueItemId: string
  participantId: string
  value: 1 | -1
}): Promise<QueueItemWithVotes> {
  return prisma.$transaction(async (tx) => {
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

    return tx.queueItem.update({
      where: { id: params.queueItemId },
      data: { score },
      include: { votes: true },
    })
  })
}
