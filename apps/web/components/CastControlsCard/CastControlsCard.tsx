"use client"

import { Cast, Loader2, Pause, Play, SkipForward } from "lucide-react"
import { useRoom } from "../../context/RoomContext"
import { useCastSender } from "../../hooks/useCastSender"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"

interface CastControlsCardProps {
  isHost: boolean
}

export function CastControlsCard({ isHost }: CastControlsCardProps) {
  const { cast, queue, sendCastCommand } = useRoom()
  const { supported, status, deviceName, connect } = useCastSender()
  const nowPlaying =
    queue.find((item) => item.id === cast?.currentQueueItemId) ?? null

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
            onClick={() =>
              void sendCastCommand(cast.isPlaying ? "pause" : "play")
            }
          >
            {cast.isPlaying ? (
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
            aria-label="Skip"
            onClick={() => void sendCastCommand("skip")}
          >
            <SkipForward className="size-4" />
          </Button>
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
