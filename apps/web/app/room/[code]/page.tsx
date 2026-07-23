"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Users, ListVideo, Plus, Youtube } from "lucide-react"
import type { RoomPreview } from "@cueball/shared"
import { api } from "../../../api/client"
import { RoomProvider, useRoom } from "../../../context/RoomContext"
import { JoinRoomForm } from "../../../components/JoinRoomForm"
import { ParticipantList } from "../../../components/ParticipantList"
import { AddVideoForm } from "../../../components/AddVideoForm"
import { QueueList } from "../../../components/QueueList"
import { ConnectYoutubeButton } from "../../../components/ConnectYoutubeButton"
import { PlaylistShare } from "../../../components/PlaylistShare"
import { Card } from "../../../components/ui/card"
import { cn } from "../../../utils/cn"

function RoomView({ roomCode }: { roomCode: string }) {
  const {
    room,
    participants,
    queue,
    self,
    connected,
    reconnecting,
    voteOnQueueItem,
  } = useRoom()
  const [preview, setPreview] = useState<RoomPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<RoomPreview>(`/api/rooms/${roomCode}`)
      .then(setPreview)
      .catch((err) =>
        setPreviewError(err instanceof Error ? err.message : "Room not found"),
      )
  }, [roomCode])

  if (previewError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p role="alert" className="text-danger">
          {previewError}
        </p>
      </main>
    )
  }

  const displayName = room?.name ?? preview?.name ?? roomCode

  if (reconnecting) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-muted">Reconnecting…</p>
      </main>
    )
  }

  if (!self) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <Card className="mx-auto flex max-w-sm flex-col gap-4 text-center">
          <h1 className="text-2xl font-bold">{displayName}</h1>
          <p className="text-sm text-muted">
            {connected ? "Enter a name to join." : "Connecting…"}
          </p>
          <JoinRoomForm />
        </Card>
      </main>
    )
  }

  const handleVote = (queueItemId: string, value: 1 | -1) => {
    voteOnQueueItem(queueItemId, value).catch((err: unknown) => {
      console.error("Failed to vote", err)
    })
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <span
              className={cn(
                "inline-block size-1.5 rounded-full",
                connected ? "bg-upvote" : "bg-muted",
              )}
            />
            {connected ? "Live" : "Reconnecting…"} ·{" "}
            <span className="font-mono font-bold tracking-widest text-text">
              {roomCode}
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            <Youtube className="size-3.5" /> YouTube playlist
          </h2>
          {room?.youtubePlaylistId ? (
            <PlaylistShare playlistId={room.youtubePlaylistId} />
          ) : self.isHost ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                Connect your YouTube account to keep a real playlist in sync
                with this queue.
              </p>
              <ConnectYoutubeButton
                roomId={room?.id ?? ""}
                roomCode={roomCode}
              />
            </div>
          ) : (
            <p className="text-sm text-muted">
              Waiting for the host to connect a YouTube playlist.
            </p>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            <Users className="size-3.5" /> Participants
          </h2>
          <ParticipantList participants={participants} selfId={self.id} />
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            <Plus className="size-3.5" /> Add a video
          </h2>
          {room?.youtubePlaylistId ? (
            <AddVideoForm />
          ) : (
            <p className="text-sm text-muted">
              Videos can be added once the host connects a YouTube playlist
              above.
            </p>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            <ListVideo className="size-3.5" /> Queue
          </h2>
          <QueueList
            queue={queue}
            participants={participants}
            selfId={self.id}
            onVote={handleVote}
          />
        </Card>
      </div>
    </main>
  )
}

export default function RoomPage() {
  const params = useParams<{ code: string }>()
  const roomCode = params.code.toUpperCase()

  return (
    <RoomProvider roomCode={roomCode}>
      <RoomView roomCode={roomCode} />
    </RoomProvider>
  )
}
