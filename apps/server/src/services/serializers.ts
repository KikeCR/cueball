import {
  RoomMode as PrismaRoomMode,
  type Participant as PrismaParticipant,
  type Room as PrismaRoom,
  type User as PrismaUser,
} from "@prisma/client"
import {
  CAST_MODE,
  PLAYLIST_MODE,
  type AuthUser,
  type ParticipantWithPresence,
  type QueueItem,
  type Room,
} from "@cueball/shared"
import type { QueueItemWithVotes } from "./queueService.js"

/**
 * Omits `relatedVideosEnabled` — that field depends on an async lookup of
 * the room's original host's own settings (see roomAllowsRelatedVideos),
 * which this function deliberately stays synchronous and independent of.
 * Callers merge it in themselves.
 */
export function serializeRoom(room: PrismaRoom): Omit<Room, "relatedVideosEnabled"> {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    mode: room.mode === PrismaRoomMode.CAST ? CAST_MODE : PLAYLIST_MODE,
    hostUserId: room.hostUserId,
    // Never serialize the access/refresh tokens, only the client-safe playlist id.
    youtubePlaylistId: room.youtubePlaylistId,
    manualQueueOrder: room.manualQueueOrder,
    repeatEnabled: room.repeatEnabled,
    createdAt: room.createdAt.toISOString(),
  }
}

export function serializeUser(user: PrismaUser): AuthUser {
  return {
    id: user.id,
    email: user.email ?? "",
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
    allowLongVideos: user.allowLongVideos,
    relatedVideosBetaEnabled: user.relatedVideosBetaEnabled,
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
