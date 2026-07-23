import type {
  ParticipantWithPresence,
  PlaybackState,
  QueueItem,
  Room,
} from "./types.js"

export const SocketEvents = {
  RoomJoin: "room:join",
  RoomLeave: "room:leave",
  RoomState: "room:state",
  RoomControllerChanged: "room:controllerChanged",

  QueueAdd: "queue:add",
  QueueVote: "queue:vote",

  PlaybackPlay: "playback:play",
  PlaybackPause: "playback:pause",
  PlaybackSeek: "playback:seek",
  PlaybackSync: "playback:sync",

  ControlHandoff: "control:handoff",
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

export interface PlaybackSeekPayload {
  roomId: string
  position: number
}

export interface PlaybackSyncPayload {
  trackId: string | null
  position: number
  isPlaying: boolean
  playbackState: PlaybackState
}

export interface ControlHandoffPayload {
  roomId: string
  toParticipantId: string
}
