"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Loader2 } from "lucide-react"
import { MAX_NAME_LENGTH } from "@cueball/shared"
import { useRoom } from "../../context/RoomContext"
import { useAuth } from "../../context/AuthContext"
import { useToast } from "../../context/ToastContext"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"

export function JoinRoomForm() {
  const { joinAsGuest } = useRoom()
  const { user } = useAuth()
  const toast = useToast()
  const [guestName, setGuestName] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user) setGuestName((current) => current || user.displayName)
  }, [user])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!guestName.trim()) return

    setSubmitting(true)
    try {
      await joinAsGuest(guestName.trim())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to join room")
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
      <Button type="submit" disabled={submitting}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {submitting ? "Joining…" : "Join room"}
      </Button>
    </form>
  )
}
