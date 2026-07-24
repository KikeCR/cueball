"use client"

import { useState, type FormEvent } from "react"
import { Loader2 } from "lucide-react"
import { MAX_NAME_LENGTH } from "@cueball/shared"
import { useRoom } from "../../context/RoomContext"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"

export function JoinRoomForm() {
  const { joinAsGuest, joinError } = useRoom()
  const [guestName, setGuestName] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!guestName.trim()) return

    setSubmitting(true)
    try {
      await joinAsGuest(guestName.trim())
    } catch {
      // joinError from context already reflects the failure
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <Label>
        Your name
        <Input
          value={guestName}
          onChange={(event) => setGuestName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
          required
        />
      </Label>
      {joinError && (
        <p role="alert" className="text-sm text-danger">
          {joinError}
        </p>
      )}
      <Button type="submit" disabled={submitting}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {submitting ? "Joining…" : "Join room"}
      </Button>
    </form>
  )
}
