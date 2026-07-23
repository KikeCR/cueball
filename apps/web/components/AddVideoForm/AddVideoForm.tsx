"use client"

import { useState, type FormEvent } from "react"
import { Loader2, Plus } from "lucide-react"
import { useRoom } from "../../context/RoomContext"
import { Button } from "../ui/button"
import { Input } from "../ui/input"

export function AddVideoForm() {
  const { addToQueue } = useRoom()
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedUrl = youtubeUrl.trim()
    if (!trimmedUrl) return

    setSubmitting(true)
    setError(null)
    try {
      await addToQueue(trimmedUrl)
      setYoutubeUrl("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add video")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="youtube-url">
          YouTube link
        </label>
        <Input
          id="youtube-url"
          className="flex-1"
          value={youtubeUrl}
          onChange={(event) => setYoutubeUrl(event.target.value)}
          placeholder="Paste a YouTube link…"
          required
        />
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
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  )
}
