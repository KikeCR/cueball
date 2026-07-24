import type {
  Participant as PrismaParticipant,
  Room as PrismaRoom,
  User as PrismaUser,
} from "@prisma/client"
import type {
  AuthUser,
  ParticipantWithPresence,
  QueueItem,
  Room,
} from "@cueball/shared"
import type { QueueItemWithVotes } from "./queueService.js"

export function serializeRoom(room: PrismaRoom): Room {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    hostUserId: room.hostUserId,
    // Never serialize the access/refresh tokens, only the client-safe playlist id.
    youtubePlaylistId: room.youtubePlaylistId,
    createdAt: room.createdAt.toISOString(),
  }
}

export function serializeUser(user: PrismaUser): AuthUser {
  return {
    id: user.id,
    email: user.email ?? "",
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
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
