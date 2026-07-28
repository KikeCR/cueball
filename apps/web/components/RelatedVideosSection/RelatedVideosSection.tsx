"use client"

import { useState } from "react"
import { Plus, RefreshCw, Sparkles } from "lucide-react"
import type { YoutubeSearchResult } from "@cueball/shared"
import { useRoom } from "../../context/RoomContext"
import { useToast } from "../../context/ToastContext"
import { Button } from "../ui/button"
import { Spinner } from "../ui/spinner"

export function RelatedVideosSection() {
  const { fetchRelatedVideos, addToQueue } = useRoom()
  const toast = useToast()
  const [results, setResults] = useState<YoutubeSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const [addingVideoId, setAddingVideoId] = useState<string | null>(null)

  const handleRefresh = async () => {
    setLoading(true)
    try {
      const related = await fetchRelatedVideos()
      setResults(related)
      setHasFetched(true)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load related videos",
      )
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (result: YoutubeSearchResult) => {
    setAddingVideoId(result.videoId)
    try {
      await addToQueue(`https://www.youtube.com/watch?v=${result.videoId}`)
      // Drops it from the list rather than re-fetching — re-fetching would
      // spend another 100-unit search.list call just to redraw a list that,
      // aside from this one now-queued video, hasn't actually changed.
      setResults((prev) => prev.filter((r) => r.videoId !== result.videoId))
      toast.success("Added to queue")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add video")
    } finally {
      setAddingVideoId(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          <Sparkles className="size-3.5" /> Related videos
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void handleRefresh()}
          disabled={loading}
        >
          {loading ? (
            <Spinner className="size-3.5" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {!hasFetched && !loading && (
        <p className="text-sm text-muted">
          Get suggestions based on what's in this room's queue.
        </p>
      )}

      {hasFetched && !loading && results.length === 0 && (
        <p className="text-sm text-muted">No related videos found.</p>
      )}

      {results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map((result) => (
            <li key={result.videoId}>
              <button
                type="button"
                aria-label={`Add ${result.title} by ${result.channelTitle}`}
                onClick={() => void handleAdd(result)}
                disabled={addingVideoId === result.videoId}
                className="flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-surface-hover disabled:opacity-60"
              >
                {result.thumbnailUrl ? (
                  <img
                    src={result.thumbnailUrl}
                    alt=""
                    width={64}
                    height={36}
                    className="h-9 w-16 shrink-0 rounded-sm object-cover"
                  />
                ) : (
                  <div className="h-9 w-16 shrink-0 rounded-sm bg-surface-hover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text">
                    {result.title}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {result.channelTitle}
                  </p>
                </div>
                <div className="flex size-7 shrink-0 items-center justify-center">
                  {addingVideoId === result.videoId ? (
                    <Spinner className="size-3.5 text-muted" />
                  ) : (
                    <Plus className="size-3.5 text-muted" />
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
