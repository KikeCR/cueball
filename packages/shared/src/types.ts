export type RoomMode = "playlist" | "cast"

export const PLAYLIST_MODE: RoomMode = "playlist"
export const CAST_MODE: RoomMode = "cast"

export interface Room {
  id: string
  code: string
  name: string | null
  mode: RoomMode
  hostUserId: string | null
  youtubePlaylistId: string | null
  manualQueueOrder: boolean
  repeatEnabled: boolean
  createdAt: string
}

export interface CastSessionState {
  connected: boolean
  deviceName: string | null
  casterParticipantId: string | null
  isPlaying: boolean
  currentQueueItemId: string | null
  restarting: boolean
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
  /** When on, any room this account originally created skips the video length cap, for anyone adding to it. */
  allowLongVideos: boolean
}

export interface RoomHistoryEntry {
  id: string
  code: string
  name: string | null
  isHost: boolean
  lastActiveAt: string
}

export interface YoutubeSearchResult {
  videoId: string
  title: string
  thumbnailUrl: string | null
  channelTitle: string
}
