"use client"

import { useState } from "react"
import { Cast, Loader2, Pause, Play, SkipForward, X } from "lucide-react"
import { useRoom } from "../../context/RoomContext"
import { useToast } from "../../context/ToastContext"
import { useCastSender } from "../../hooks/useCastSender"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"

interface CastControlsCardProps {
  isHost: boolean
}

export function CastControlsCard({ isHost }: CastControlsCardProps) {
  const { cast, queue, sendCastCommand } = useRoom()
  const { supported, status, deviceName, connect, disconnect } = useCastSender()
  const toast = useToast()
  const [togglePending, setTogglePending] = useState(false)
  const [skipPending, setSkipPending] = useState(false)
  const nowPlaying =
    queue.find((item) => item.id === cast?.currentQueueItemId) ?? null

  const reportCommandError = (err: unknown) => {
    toast.error(
      err instanceof Error ? err.message : "Couldn't send that command to the TV",
    )
  }

  const handleTogglePlay = async () => {
    if (!cast) return
    setTogglePending(true)
    try {
      await sendCastCommand(cast.isPlaying ? "pause" : "play")
    } catch (err) {
      reportCommandError(err)
    } finally {
      setTogglePending(false)
    }
  }

  const handleSkip = async () => {
    setSkipPending(true)
    try {
      await sendCastCommand("skip")
    } catch (err) {
      reportCommandError(err)
    } finally {
      setSkipPending(false)
    }
  }

  if (!cast?.connected) {
    if (!isHost) {
      return (
        <p className="text-sm text-muted">
          Waiting for the host to connect a TV.
        </p>
      )
    }
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Connect a Chromecast to play the queue on a TV.
          </p>
          <Button
            type="button"
            onClick={() => void connect()}
            disabled={!supported || status === "connecting"}
          >
            {status === "connecting" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Cast className="size-4" />
            )}
            {status === "connecting" ? "Connecting…" : "Connect to TV"}
          </Button>
        </div>
        {!supported && (
          <p className="text-xs text-muted">
            Casting requires Chrome on desktop or Android.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge variant="primary">{deviceName ?? cast.deviceName ?? "TV"}</Badge>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="icon"
            size="sm"
            className="w-9 px-0"
            aria-label={cast.isPlaying ? "Pause" : "Play"}
            title={cast.isPlaying ? "Pause" : "Play"}
            disabled={togglePending}
            onClick={() => void handleTogglePlay()}
          >
            {togglePending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : cast.isPlaying ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="icon"
            size="sm"
            className="w-9 px-0"
            aria-label="Skip to next video"
            title="Skip to next video"
            disabled={skipPending}
            onClick={() => void handleSkip()}
          >
            {skipPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <SkipForward className="size-4" />
            )}
          </Button>
          {isHost && (
            <Button
              type="button"
              variant="icon"
              size="sm"
              className="w-9 px-0"
              aria-label="Disconnect from TV"
              title="Disconnect from TV"
              onClick={disconnect}
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>
      {nowPlaying && (
        <div className="flex items-center gap-3">
          {nowPlaying.thumbnailUrl && (
            <img
              src={nowPlaying.thumbnailUrl}
              alt=""
              className="h-10 w-16 rounded-sm object-cover"
            />
          )}
          <p className="truncate text-sm font-semibold">{nowPlaying.title}</p>
        </div>
      )}
    </div>
  )
}
