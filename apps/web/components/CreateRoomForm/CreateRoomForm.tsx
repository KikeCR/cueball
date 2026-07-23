"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import type { CreateRoomRequest, CreateRoomResponse } from "@cueball/shared"
import { api } from "../../api/client"
import { storeParticipantToken } from "../../utils/participantSession"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"

export function CreateRoomForm() {
  const router = useRouter()
  const [hostName, setHostName] = useState("")
  const [roomName, setRoomName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmedHostName = hostName.trim()
    if (!trimmedHostName) return

    setSubmitting(true)
    setError(null)
    try {
      const request: CreateRoomRequest = {
        hostName: trimmedHostName,
        roomName: roomName.trim() || undefined,
      }
      const response = await api.post<CreateRoomResponse>("/api/rooms", request)
      storeParticipantToken(response.room.code, response.participantToken)
      router.push(`/room/${response.room.code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room")
      setSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <Label>
        Your name
        <Input
          value={hostName}
          onChange={(event) => setHostName(event.target.value)}
          maxLength={40}
          required
        />
      </Label>
      <Label>
        Room name (optional)
        <Input
          value={roomName}
          onChange={(event) => setRoomName(event.target.value)}
          maxLength={80}
        />
      </Label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={submitting}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {submitting ? "Creating…" : "Create room"}
      </Button>
    </form>
  )
}
