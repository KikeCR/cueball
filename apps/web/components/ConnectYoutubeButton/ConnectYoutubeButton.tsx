"use client"

import { getStoredParticipantToken } from "../../utils/participantSession"
import { Button } from "../ui/button"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"

interface ConnectYoutubeButtonProps {
  roomId: string
  roomCode: string
}

export function ConnectYoutubeButton({
  roomId,
  roomCode,
}: ConnectYoutubeButtonProps) {
  const handleClick = () => {
    const token = getStoredParticipantToken(roomCode)
    if (!token) return
    window.location.href = `${API_URL}/api/rooms/${roomId}/youtube/connect?token=${encodeURIComponent(token)}`
  }

  return (
    <Button type="button" variant="ghost" onClick={handleClick}>
      Connect YouTube
    </Button>
  )
}
