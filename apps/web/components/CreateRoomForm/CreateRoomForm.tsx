"use client"

import { useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Cast, Loader2 } from "lucide-react"
import {
  CAST_MODE,
  MAX_NAME_LENGTH,
  MAX_ROOM_NAME_LENGTH,
  PLAYLIST_MODE,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type RoomMode,
} from "@cueball/shared"
import { api } from "../../api/client"
import { useAuth } from "../../context/AuthContext"
import { useToast } from "../../context/ToastContext"
import { storeParticipantToken } from "../../utils/participantSession"
import { YouTubeIcon } from "../icons"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"

export function CreateRoomForm() {
  const router = useRouter()
  const { token, user } = useAuth()
  const toast = useToast()
  const [hostName, setHostName] = useState("")
  const [roomName, setRoomName] = useState("")
  const [mode, setMode] = useState<RoomMode>(CAST_MODE)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user) setHostName((current) => current || user.displayName)
  }, [user])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedHostName = hostName.trim()
    if (!trimmedHostName) return

    setSubmitting(true)
    try {
      const request: CreateRoomRequest = {
        hostName: trimmedHostName,
        roomName: roomName.trim() || undefined,
        mode,
      }
      const response = await api.post<CreateRoomResponse>(
        "/api/rooms",
        request,
        token ?? undefined,
      )
      storeParticipantToken(response.room.code, response.participantToken)
      router.push(`/room/${response.room.code}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create room")
      setSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex gap-1 rounded-md bg-surface-hover p-1">
        <button
          type="button"
          onClick={() => setMode(CAST_MODE)}
          className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-colors ${
            mode === CAST_MODE ? "bg-surface text-text" : "text-muted"
          }`}
        >
          <Cast className="size-5" /> Cast
        </button>
        <button
          type="button"
          onClick={() => setMode(PLAYLIST_MODE)}
          className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-colors ${
            mode === PLAYLIST_MODE ? "bg-surface text-text" : "text-muted"
          }`}
        >
          <YouTubeIcon className="size-5" /> Playlist
        </button>
      </div>
      <Label>
        Your name
        <Input
          value={hostName}
          onChange={(event) => setHostName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          required
        />
      </Label>
      <Label>
        Room name (optional)
        <Input
          value={roomName}
          onChange={(event) => setRoomName(event.target.value)}
          maxLength={MAX_ROOM_NAME_LENGTH}
        />
      </Label>
      <Button type="submit" disabled={submitting}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {submitting ? "Creating…" : "Create room"}
      </Button>
    </form>
  )
}
