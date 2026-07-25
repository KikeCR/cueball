export type RoomMode = "playlist" | "cast"

export interface Room {
  id: string
  code: string
  name: string | null
  mode: RoomMode
  hostUserId: string | null
  youtubePlaylistId: string | null
  /** True once the host has manually reordered the queue; a host vote hands ordering back to votes. */
  manualQueueOrder: boolean
  createdAt: string
}

export interface CastSessionState {
  connected: boolean
  deviceName: string | null
  casterParticipantId: string | null
  isPlaying: boolean
  currentQueueItemId: string | null
  currentTimeSeconds: number | null
  durationSeconds: number | null
}

export interface Participant {
  id: string
  roomId: string
  userId: string | null
  guestName: string | null
  isHost: boolean
  joinedAt: string
}

export interface ParticipantWithPresence extends Participant {
  connected: boolean
}

export interface RoomPreview {
  id: string
  code: string
  name: string | null
  createdAt: string
}

export interface QueueItemVote {
  participantId: string
  value: 1 | -1
}

export interface QueueItem {
  id: string
  roomId: string
  youtubeVideoId: string
  title: string
  thumbnailUrl: string | null
  addedByParticipantId: string | null
  score: number
  playedAt: string | null
  createdAt: string
  votes: QueueItemVote[]
}

export interface Vote {
  id: string
  queueItemId: string
  participantId: string
  value: 1 | -1
  createdAt: string
}

export interface AuthUser {
  id: string
  email: string
  displayName: string
  createdAt: string
}

export interface RoomHistoryEntry {
  id: string
  code: string
  name: string | null
  isHost: boolean
  lastActiveAt: string
}
