import { Check, ExternalLink, PlayCircle } from "lucide-react"
import type { QueueItem } from "@cueball/shared"
import { Button } from "../ui/button"

interface NowPlayingBannerProps {
  item: QueueItem | null
  canMarkPlayed?: boolean
  onMarkPlayed?: () => void
}

// Playlist-sync rooms don't play anything through CueBall itself — everyone
// watches the real YouTube playlist on their own — so this is really "where
// the room's queue currently is" (the topmost unplayed item) rather than a
// literal playback signal, but it gives people something to glance at
// without scrolling to the queue card. Cast mode already has its own
// now-playing display in CastControlsCard, so this stays out of its way.
export function NowPlayingBanner({
  item,
  canMarkPlayed = false,
  onMarkPlayed,
}: NowPlayingBannerProps) {
  if (!item) return null

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
      <a
        href={`https://www.youtube.com/watch?v=${item.youtubeVideoId}`}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md transition-colors hover:opacity-80"
      >
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt=""
            width={80}
            height={45}
            className="h-[45px] w-20 shrink-0 rounded-sm object-cover"
          />
        ) : (
          <div className="h-[45px] w-20 shrink-0 rounded-sm bg-surface-hover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-wider text-muted">
            <PlayCircle className="size-3.5" /> Now playing
          </p>
          <p className="truncate text-sm font-semibold text-text">
            {item.title}
          </p>
        </div>
        <ExternalLink className="size-4 shrink-0 text-muted" />
      </a>
      {canMarkPlayed && onMarkPlayed && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onMarkPlayed}
          className="shrink-0"
        >
          <Check className="size-3.5" /> Mark as played
        </Button>
      )}
    </div>
  )
}
