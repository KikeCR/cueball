import type {
  AuthUser,
  ParticipantWithPresence,
  QueueItem,
  Room,
  RoomHistoryEntry,
} from "./types.js"

export const SocketEvents = {
  RoomJoin: "room:join",
  RoomLeave: "room:leave",
  RoomState: "room:state",

  QueueAdd: "queue:add",
  QueueVote: "queue:vote",
  QueueRemove: "queue:remove",
} as const

export interface RoomJoinPayload {
  roomCode: string
  guestName: string
}

export interface RoomStatePayload {
  room: Room
  participants: ParticipantWithPresence[]
  queue: QueueItem[]
}

export interface RoomJoinResult {
  room: Room
  participant: ParticipantWithPresence
  /** Persisted client-side and sent as the socket auth token on reconnect. */
  participantToken: string
  participants: ParticipantWithPresence[]
  queue: QueueItem[]
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
}

export interface CreateRoomResponse {
  room: Room
  participant: ParticipantWithPresence
  /** Persisted client-side and sent as the socket auth token on reconnect. */
  participantToken: string
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
