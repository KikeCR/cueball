"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Users, ListVideo, Plus, Youtube, Cast, Loader2, Trash2 } from "lucide-react"
import type { ConfigResponse, RoomPreview } from "@cueball/shared"
import { api } from "../../../api/client"
import { RoomProvider, useRoom } from "../../../context/RoomContext"
import { useToast } from "../../../context/ToastContext"
import { JoinRoomForm } from "../../../components/JoinRoomForm"
import { ParticipantList } from "../../../components/ParticipantList"
import { AddVideoForm } from "../../../components/AddVideoForm"
import { QueueList } from "../../../components/QueueList"
import { ConnectYoutubeButton } from "../../../components/ConnectYoutubeButton"
import { PlaylistShare } from "../../../components/PlaylistShare"
import { CastControlsCard } from "../../../components/CastControlsCard"
import { NowPlayingBanner } from "../../../components/NowPlayingBanner"
import { CopyButton } from "../../../components/CopyButton"
import { Card } from "../../../components/ui/card"
import { Button } from "../../../components/ui/button"
import { ConfirmDialog } from "../../../components/ui/confirmDialog"
import { cn } from "../../../utils/cn"

function RoomView({ roomCode }: { roomCode: string }) {
  const {
    room,
    participants,
    queue,
    cast,
    self,
    connected,
    reconnecting,
    removedReason,
    playlistSyncError,
    voteOnQueueItem,
    removeQueueItem,
    reorderQueue,
    setQueueItemPlayed,
    clearQueue,
    clearHistory,
    setRepeat,
    removeParticipant,
    renameSelf,
  } = useRoom()
  const toast = useToast()
  const [preview, setPreview] = useState<RoomPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [clearQueueDialogOpen, setClearQueueDialogOpen] = useState(false)
  const [clearHistoryDialogOpen, setClearHistoryDialogOpen] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [roomExpiryHours, setRoomExpiryHours] = useState<number | null>(null)

  useEffect(() => {
    api
      .get<RoomPreview>(`/api/rooms/${roomCode}`)
      .then(setPreview)
      .catch((err) =>
        setPreviewError(err instanceof Error ? err.message : "Room not found"),
      )
  }, [roomCode])

  useEffect(() => {
    // Best-effort: purely informational, so a failure here shouldn't affect
    // the room itself or surface an error toast.
    api
      .get<ConfigResponse>("/api/config")
      .then((data) => setRoomExpiryHours(data.roomExpiryHours))
      .catch(() => {})
  }, [])

  useEffect(() => {
    // Deliberately omits `toast` from deps: ToastProvider's context value is
    // a fresh object every render (toasts array changes), so depending on
    // it here would re-fire this on every toast, not just new sync failures.
    if (playlistSyncError) toast.error(playlistSyncError.message)
  }, [playlistSyncError])

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
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="relative flex size-14 items-center justify-center">
          <span className="absolute inline-flex size-14 animate-ping rounded-full bg-primary/30" />
          <Loader2 className="relative size-8 animate-spin text-primary" />
        </div>
        <p className="text-sm font-semibold text-muted">Reconnecting…</p>
      </main>
    )
  }

  if (!self) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <Card className="mx-auto flex max-w-sm flex-col gap-4 text-center">
          <h1 className="text-2xl font-bold">
            {room || preview ? displayName : "Loading…"}
          </h1>
          <p className={cn("text-sm", removedReason ? "text-danger" : "text-muted")}>
            {removedReason ?? (connected ? "Enter a name to join." : "Connecting…")}
          </p>
          <JoinRoomForm />
        </Card>
      </main>
    )
  }

  const reportActionError = (fallback: string) => (err: unknown) => {
    console.error(fallback, err)
    toast.error(err instanceof Error ? err.message : fallback)
  }

  const handleVote = (queueItemId: string, value: 1 | -1) => {
    voteOnQueueItem(queueItemId, value).catch(reportActionError("Failed to vote"))
  }

  const handleRemove = (queueItemId: string) => {
    removeQueueItem(queueItemId).catch(
      reportActionError("Failed to remove queue item"),
    )
  }

  const handleReorder = (orderedQueueItemIds: string[]) => {
    // Reorder is confirm-before-commit against the real YouTube playlist
    // (writes go one at a time — see syncPlaylistOrderForItems), so a
    // multi-item drag can take a few seconds to land. Surface that as a
    // pending state instead of leaving the drop looking like it did nothing
    // until the broadcast finally arrives.
    setReordering(true)
    reorderQueue(orderedQueueItemIds)
      .catch(reportActionError("Failed to reorder queue"))
      .finally(() => setReordering(false))
  }

  const handleSetPlayed = (queueItemId: string, played: boolean) => {
    setQueueItemPlayed(queueItemId, played).catch(
      reportActionError("Failed to update played state"),
    )
  }

  const handleRemoveParticipant = (participantId: string) => {
    removeParticipant(participantId)
      .then(() => toast.success("Participant removed"))
      .catch(reportActionError("Failed to remove participant"))
  }

  const handleRename = (name: string) => {
    renameSelf(name).catch(reportActionError("Failed to rename"))
  }

  const handleClearQueue = () => {
    setClearQueueDialogOpen(false)
    clearQueue()
      .then(({ clearedCount, totalCount }) => {
        toast.success(
          clearedCount < totalCount
            ? `Cleared ${clearedCount} of ${totalCount} — some couldn't be removed from YouTube`
            : `Cleared ${clearedCount} video${clearedCount === 1 ? "" : "s"}`,
        )
      })
      .catch(reportActionError("Failed to clear the queue"))
  }

  const handleClearHistory = () => {
    setClearHistoryDialogOpen(false)
    clearHistory()
      .then(() => toast.success("Played history cleared"))
      .catch(reportActionError("Failed to clear played history"))
  }

  const handleSetRepeat = (enabled: boolean) => {
    setRepeat(enabled)
      .then(() => toast.success(enabled ? "Repeat enabled" : "Repeat disabled"))
      .catch(reportActionError("Failed to update repeat"))
  }

  const nowPlayingItem = queue.find((item) => !item.playedAt) ?? null
  const canMarkNowPlayingPlayed = Boolean(
    nowPlayingItem &&
      (self.id === nowPlayingItem.addedByParticipantId || self.isHost),
  )

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
            <CopyButton value={roomCode} label="Copy room code" />
          </p>
          {roomExpiryHours != null && (
            <p className="mt-0.5 text-xs text-muted">
              Inactive rooms are cleared automatically after {roomExpiryHours}h.
            </p>
          )}
        </div>
      </div>

      {!(room?.mode === "cast" && cast?.connected) && (
        <div className="mb-5">
          <NowPlayingBanner
            item={nowPlayingItem}
            canMarkPlayed={canMarkNowPlayingPlayed}
            onMarkPlayed={() =>
              nowPlayingItem && handleSetPlayed(nowPlayingItem.id, true)
            }
          />
        </div>
      )}

      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-3">
          {room?.mode === "cast" ? (
            <>
              <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
                <Cast className="size-3.5" /> Cast to TV
              </h2>
              <CastControlsCard isHost={self.isHost} />
            </>
          ) : (
            <>
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
            </>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            <Users className="size-3.5" /> Participants
          </h2>
          <ParticipantList
            participants={participants}
            selfId={self.id}
            isSelfHost={self.isHost}
            onRemove={handleRemoveParticipant}
            onRename={handleRename}
          />
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            <Plus className="size-3.5" /> Add a video
          </h2>
          {room?.mode === "cast" || room?.youtubePlaylistId ? (
            <AddVideoForm />
          ) : (
            <p className="text-sm text-muted">
              Videos can be added once the host connects a YouTube playlist
              above.
            </p>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
              <ListVideo className="size-3.5" /> Queue
            </h2>
            {self.isHost && queue.some((item) => !item.playedAt) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setClearQueueDialogOpen(true)}
              >
                <Trash2 className="size-3.5" /> Clear queue
              </Button>
            )}
          </div>
          <QueueList
            queue={queue}
            participants={participants}
            selfId={self.id}
            onVote={handleVote}
            onRemove={handleRemove}
            onReorder={handleReorder}
            onSetPlayed={handleSetPlayed}
            onClearHistory={() => setClearHistoryDialogOpen(true)}
            manualOrderActive={Boolean(room?.manualQueueOrder)}
            repeatEnabled={Boolean(room?.repeatEnabled)}
            onSetRepeat={handleSetRepeat}
            reordering={reordering}
          />
        </Card>
      </div>

      <ConfirmDialog
        open={clearQueueDialogOpen}
        title="Clear the queue?"
        description="This removes every upcoming video for everyone in the room. Already-played history is kept."
        confirmLabel="Clear queue"
        danger
        onConfirm={handleClearQueue}
        onCancel={() => setClearQueueDialogOpen(false)}
      />
      <ConfirmDialog
        open={clearHistoryDialogOpen}
        title="Clear played history?"
        description="This permanently removes every already-played video from this room. This can't be undone."
        confirmLabel="Clear history"
        danger
        onConfirm={handleClearHistory}
        onCancel={() => setClearHistoryDialogOpen(false)}
      />
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
