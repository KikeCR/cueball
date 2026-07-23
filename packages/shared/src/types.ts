export type PlaybackState = "PLAYING" | "PAUSED";

export interface Room {
  id: string;
  code: string;
  name: string | null;
  hostUserId: string | null;
  controllerId: string | null;
  currentTrackId: string | null;
  playbackState: PlaybackState;
  playbackPosition: number;
  createdAt: string;
}

export interface Participant {
  id: string;
  roomId: string;
  userId: string | null;
  guestName: string | null;
  isHost: boolean;
  joinedAt: string;
}

export interface QueueItem {
  id: string;
  roomId: string;
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string | null;
  addedByParticipantId: string | null;
  score: number;
  playedAt: string | null;
  createdAt: string;
}

export interface Vote {
  id: string;
  queueItemId: string;
  participantId: string;
  value: 1 | -1;
  createdAt: string;
}
