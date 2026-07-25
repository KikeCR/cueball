"use client"

import { useState } from "react"
import { getStoredParticipantToken } from "../../utils/participantSession"
import { Button } from "../ui/button"
import { Spinner } from "../ui/spinner"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"

interface ConnectYoutubeButtonProps {
  roomId: string
  roomCode: string
}

export function ConnectYoutubeButton({
  roomId,
  roomCode,
}: ConnectYoutubeButtonProps) {
  const [redirecting, setRedirecting] = useState(false)

  const handleClick = () => {
    const token = getStoredParticipantToken(roomCode)
    if (!token) return
    setRedirecting(true)
    window.location.href = `${API_URL}/api/rooms/${roomId}/youtube/connect?token=${encodeURIComponent(token)}`
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={handleClick}
      disabled={redirecting}
    >
      {redirecting && <Spinner />}
      Connect YouTube
    </Button>
  )
}
