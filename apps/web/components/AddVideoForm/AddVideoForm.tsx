"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Loader2, Plus, X } from "lucide-react"
import type { YoutubeSearchResponse, YoutubeSearchResult } from "@cueball/shared"
import { api } from "../../api/client"
import { useRoom } from "../../context/RoomContext"
import { useToast } from "../../context/ToastContext"
import { Button } from "../ui/button"
import { Input } from "../ui/input"

const SEARCH_DEBOUNCE_MS = 500
const MIN_SEARCH_QUERY_LENGTH = 3

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

export function AddVideoForm() {
  const { addToQueue } = useRoom()
  const toast = useToast()
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<YoutubeSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const requestIdRef = useRef(0)
  const containerRef = useRef<HTMLFormElement>(null)

  // Debounced search: only for text that isn't already a pasted link (those
  // just submit directly, same as before). search.list costs 100 YouTube
  // quota units per call — vs. ~1 for everything else this app calls — so
  // this waits for a pause in typing rather than firing per keystroke, and
  // the server caches identical queries on top of that.
  useEffect(() => {
    const query = youtubeUrl.trim()
    if (!query || looksLikeUrl(query) || query.length < MIN_SEARCH_QUERY_LENGTH) {
      setResults([])
      setSearching(false)
      return
    }

    const requestId = ++requestIdRef.current
    setSearching(true)
    const timer = window.setTimeout(() => {
      api
        .get<YoutubeSearchResponse>(`/api/youtube/search?q=${encodeURIComponent(query)}`)
        .then((response) => {
          if (requestIdRef.current !== requestId) return
          setResults(response.results)
        })
        .catch(() => {
          // Best-effort enhancement: a search failing (unconfigured server,
          // quota exhausted, network hiccup) shouldn't interrupt typing with
          // an error toast — pasting a direct link still works regardless.
          if (requestIdRef.current === requestId) setResults([])
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setSearching(false)
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [youtubeUrl])

  // Hides the dropdown on an outside click without touching what's typed —
  // re-typing (or refocusing, if results are still around) brings it back.
  useEffect(() => {
    if (results.length === 0 && !searching) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setDismissed(true)
      }
    }
    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [results.length, searching])

  const handleClearSearch = () => {
    setYoutubeUrl("")
    setResults([])
    setDismissed(false)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedUrl = youtubeUrl.trim()
    if (!trimmedUrl) return

    setSubmitting(true)
    try {
      await addToQueue(trimmedUrl)
      setYoutubeUrl("")
      setResults([])
      toast.success("Added to queue")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add video")
    } finally {
      setSubmitting(false)
    }
  }

  const handleSelectResult = async (result: YoutubeSearchResult) => {
    setResults([])
    setSubmitting(true)
    try {
      await addToQueue(`https://www.youtube.com/watch?v=${result.videoId}`)
      setYoutubeUrl("")
      toast.success("Added to queue")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add video")
    } finally {
      setSubmitting(false)
    }
  }

  const showDropdown = !dismissed && (results.length > 0 || searching)

  return (
    <form
      ref={containerRef}
      className="relative flex flex-col gap-2"
      onSubmit={handleSubmit}
    >
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="youtube-url">
          YouTube link or search
        </label>
        <div className="relative flex-1">
          <Input
            id="youtube-url"
            className="w-full pr-9"
            value={youtubeUrl}
            onChange={(event) => {
              setYoutubeUrl(event.target.value)
              setDismissed(false)
            }}
            onFocus={() => setDismissed(false)}
            placeholder="Paste a link or search for a video…"
            autoComplete="off"
            required
          />
          {youtubeUrl && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={handleClearSearch}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted hover:text-text"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          <span className="hidden sm:inline">
            {submitting ? "Adding…" : "Add"}
          </span>
        </Button>
      </div>

      {showDropdown && (
        <ul className="absolute top-full z-10 mt-1 flex w-full flex-col gap-1 rounded-md border border-border bg-surface p-1 shadow-lg">
          {searching && results.length === 0 && (
            <li className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted">
              <Loader2 className="size-3.5 animate-spin" /> Searching…
            </li>
          )}
          {results.map((result) => (
            <li key={result.videoId}>
              <button
                type="button"
                aria-label={`Add ${result.title} by ${result.channelTitle}`}
                onMouseDown={(event) => {
                  // Fires before the input's blur, unlike onClick, so the
                  // dropdown doesn't close itself before the click lands.
                  event.preventDefault()
                  void handleSelectResult(result)
                }}
                className="flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-surface-hover"
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
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}
