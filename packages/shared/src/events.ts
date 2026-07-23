import type { Participant, PlaybackState, QueueItem, Room } from "./types.js";

export const SocketEvents = {
  RoomJoin: "room:join",
  RoomLeave: "room:leave",
  RoomState: "room:state",
  RoomControllerChanged: "room:controllerChanged",

  QueueAdd: "queue:add",
  QueueVote: "queue:vote",
  QueueUpdate: "queue:update",

  PlaybackPlay: "playback:play",
  PlaybackPause: "playback:pause",
  PlaybackSeek: "playback:seek",
  PlaybackSync: "playback:sync",

  ControlHandoff: "control:handoff",
} as const;

export interface RoomJoinPayload {
  roomCode: string;
  guestName?: string;
}

export interface RoomStatePayload {
  room: Room;
  participants: Participant[];
  queue: QueueItem[];
}

export interface QueueAddPayload {
  roomId: string;
  youtubeUrl: string;
}

export interface QueueVotePayload {
  queueItemId: string;
  value: 1 | -1;
}

export interface PlaybackSeekPayload {
  roomId: string;
  position: number;
}

export interface PlaybackSyncPayload {
  trackId: string | null;
  position: number;
  isPlaying: boolean;
  playbackState: PlaybackState;
}

export interface ControlHandoffPayload {
  roomId: string;
  toParticipantId: string;
}
