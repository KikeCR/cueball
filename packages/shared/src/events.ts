import type {
  AuthUser,
  CastSessionState,
  ParticipantWithPresence,
  QueueItem,
  Room,
  RoomHistoryEntry,
  RoomMode,
} from "./types.js"

export const SocketEvents = {
  RoomJoin: "room:join",
  RoomLeave: "room:leave",
  RoomState: "room:state",

  ParticipantRemove: "participant:remove",
  ParticipantRemoved: "participant:removed",
  ParticipantRename: "participant:rename",

  QueueAdd: "queue:add",
  QueueVote: "queue:vote",
  QueueRemove: "queue:remove",
  QueueReorder: "queue:reorder",
  QueueSetPlayed: "queue:set-played",

  PlaylistSyncFailed: "playlist:sync-failed",

  CastSessionStarted: "cast:session-started",
  CastSessionEnded: "cast:session-ended",
  CastCommand: "cast:command",
  CastStateReport: "cast:state-report",
  CastAdvance: "cast:advance",
} as const

export interface RoomJoinPayload {
  roomCode: string
  guestName: string
}

export interface RoomStatePayload {
  room: Room
  participants: ParticipantWithPresence[]
  queue: QueueItem[]
  cast: CastSessionState | null
}

export interface RoomJoinResult {
  room: Room
  participant: ParticipantWithPresence
  /** Persisted client-side and sent as the socket auth token on reconnect. */
  participantToken: string
  participants: ParticipantWithPresence[]
  queue: QueueItem[]
  cast: CastSessionState | null
}

export interface ActionError {
  error: string
}

export interface ActionOk {
  ok: true
}

export interface CreateRoomRequest {
  hostName: string
  roomName?: string
  mode?: RoomMode
}

export interface CreateRoomResponse {
  room: Room
  participant: ParticipantWithPresence
  /** Persisted client-side and sent as the socket auth token on reconnect. */
  participantToken: string
}

export interface ParticipantRemovePayload {
  participantId: string
}

export interface ParticipantRemovedPayload {
  reason: string
}

export interface ParticipantRenamePayload {
  name: string
}

export interface QueueAddPayload {
  youtubeUrl: string
}

export interface QueueVotePayload {
  queueItemId: string
  value: 1 | -1
}

export interface QueueRemovePayload {
  queueItemId: string
}

export interface QueueReorderPayload {
  /** Every queue item id currently in the room, in the new play order. */
  orderedQueueItemIds: string[]
}

export interface QueueSetPlayedPayload {
  queueItemId: string
  played: boolean
}

export interface PlaylistSyncFailedPayload {
  reason: string
}

export interface CastSessionStartedPayload {
  deviceName: string
}

export type CastCommandAction = "play" | "pause" | "skip" | "seek"

export interface CastCommandPayload {
  action: CastCommandAction
  seekSeconds?: number
}

export interface CastStateReportPayload {
  isPlaying: boolean
  currentQueueItemId: string | null
  currentTimeSeconds: number | null
  durationSeconds: number | null
}

export interface CastAdvanceResult {
  nextYoutubeVideoId: string | null
  nextQueueItemId: string | null
}

export interface RegisterRequest {
  email: string
  password: string
  displayName: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface AuthResponse {
  user: AuthUser
  /** Persisted client-side and sent as the Authorization bearer token. */
  token: string
}

export interface RoomHistoryResponse {
  rooms: RoomHistoryEntry[]
}
