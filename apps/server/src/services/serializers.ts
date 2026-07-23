import type {
  Participant as PrismaParticipant,
  Room as PrismaRoom,
} from "@prisma/client"
import type { ParticipantWithPresence, QueueItem, Room } from "@cueball/shared"
import type { QueueItemWithVotes } from "./queueService.js"

export function serializeRoom(room: PrismaRoom): Room {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    hostUserId: room.hostUserId,
    controllerId: room.controllerId,
    currentTrackId: room.currentTrackId,
    playbackState: room.playbackState,
    playbackPosition: room.playbackPosition,
    createdAt: room.createdAt.toISOString(),
  }
}

export function serializeParticipant(
  participant: PrismaParticipant,
  connected: boolean,
): ParticipantWithPresence {
  return {
    id: participant.id,
    roomId: participant.roomId,
    userId: participant.userId,
    guestName: participant.guestName,
    isHost: participant.isHost,
    joinedAt: participant.joinedAt.toISOString(),
    connected,
  }
}

export function serializeQueueItem(item: QueueItemWithVotes): QueueItem {
  return {
    id: item.id,
    roomId: item.roomId,
    youtubeVideoId: item.youtubeVideoId,
    title: item.title,
    thumbnailUrl: item.thumbnailUrl,
    addedByParticipantId: item.addedByParticipantId,
    score: item.score,
    playedAt: item.playedAt ? item.playedAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    votes: item.votes.map((vote) => ({
      participantId: vote.participantId,
      value: vote.value as 1 | -1,
    })),
  }
}
