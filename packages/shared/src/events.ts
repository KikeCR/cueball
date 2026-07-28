import type {
  AuthUser,
  CastSessionState,
  ParticipantWithPresence,
  QueueItem,
  Room,
  RoomHistoryEntry,
  RoomMode,
  YoutubeSearchResult,
} from "./types.js"

export const SocketEvents = {
  RoomJoin: "room:join",
  RoomLeave: "room:leave",
  RoomState: "room:state",

  ParticipantRemove: "participant:remove",
  ParticipantRemoved: "participant:removed",
  ParticipantRename: "participant:rename",
  ParticipantPromote: "participant:promote",

  QueueAdd: "queue:add",
  QueueVote: "queue:vote",
  QueueRemove: "queue:remove",
  QueueReorder: "queue:reorder",
  QueueSetPlayed: "queue:set-played",
  QueueClear: "queue:clear",
  QueueClearHistory: "queue:clear-history",
  QueueRelated: "queue:related",
  RoomSetRepeat: "room:set-repeat",
  RoomRename: "room:rename",

  PlaylistSyncFailed: "playlist:sync-failed",

  CastSessionStarted: "cast:session-started",
  CastSessionEnded: "cast:session-ended",
  CastCommand: "cast:command",
  CastConnectWithCode: "cast:connect-with-code",
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
  /** Shared across the whole room, like the queue — refreshed by any participant, seen by everyone. */
  relatedVideos: YoutubeSearchResult[]
}

export interface RoomJoinResult {
  room: Room
  participant: ParticipantWithPresence
  /** Persisted client-side and sent as the socket auth token on reconnect. */
  participantToken: string
  participants: ParticipantWithPresence[]
  queue: QueueItem[]
  cast: CastSessionState | null
  relatedVideos: YoutubeSearchResult[]
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

export interface ParticipantPromotePayload {
  participantId: string
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

export interface QueueClearResult {
  clearedCount: number
  totalCount: number
}

export interface RoomSetRepeatPayload {
  enabled: boolean
}

/** An empty/blank name clears the room's custom name, falling back to the room code as the display name. */
export interface RoomRenamePayload {
  name: string
}

export interface PlaylistSyncFailedPayload {
  reason: string
}

export interface CastSessionStartedPayload {
  deviceName: string
  /** The paired TV's YouTube "screen id" — obtained via the Cast MDX message channel, needed to drive playback through YouTube's Lounge API. */
  screenId: string | null
}

/**
 * The alternative to CastSessionStarted for devices with no Cast support at
 * all (Roku, most smart TVs, game consoles) — any screen showing the
 * YouTube app can display a manual pairing code (Settings > "Link with TV
 * code") that this exchanges for the same kind of Lounge session, server-side.
 */
export interface CastConnectWithCodePayload {
  pairingCode: string
}

export type CastCommandAction = "play" | "pause" | "skip" | "seek"

export interface CastCommandPayload {
  action: CastCommandAction
  seekSeconds?: number
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

/** Every field is optional — a partial update, only the fields present are changed. */
export interface UpdateUserSettingsRequest {
  allowLongVideos?: boolean
  relatedVideosBetaEnabled?: boolean
}

export interface YoutubeSearchResponse {
  results: YoutubeSearchResult[]
}

export interface ConfigResponse {
  /** Rooms with no activity for this many hours, and nobody connected, get deleted automatically. */
  roomExpiryHours: number
  /** False once today's YouTube API quota usage crosses the related-videos safety threshold — the beta section hides itself rather than risk starving search of quota. */
  youtubeQuotaHealthy: boolean
}
