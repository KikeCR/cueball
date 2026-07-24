"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import type { RoomHistoryEntry, RoomHistoryResponse } from "@cueball/shared"
import { api } from "../../api/client"
import { useAuth } from "../../context/AuthContext"
import { Badge } from "../ui/badge"

export function RoomHistoryList() {
  const { token } = useAuth()
  const [rooms, setRooms] = useState<RoomHistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    api
      .get<RoomHistoryResponse>("/api/auth/me/rooms", token)
      .then((data) => setRooms(data.rooms))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load rooms"),
      )
  }, [token])

  if (error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    )
  }

  if (!rooms) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" /> Loading rooms…
      </p>
    )
  }

  if (rooms.length === 0) {
    return (
      <p className="text-sm text-muted">
        No rooms yet. Create or join one to see it here.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-1">
      {rooms.map((room) => (
        <li key={room.id}>
          <Link
            href={`/room/${room.code}`}
            className="flex items-center justify-between gap-3 rounded-sm px-2 py-1.5 hover:bg-surface-hover"
          >
            <span className="flex-1 truncate text-sm">
              {room.name ?? room.code}
            </span>
            {room.isHost && <Badge variant="primary">host</Badge>}
            <span className="font-mono text-xs text-muted">{room.code}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
