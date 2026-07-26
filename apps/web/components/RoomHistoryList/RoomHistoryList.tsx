"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Trash2 } from "lucide-react"
import type { RoomHistoryEntry, RoomHistoryResponse } from "@cueball/shared"
import { api } from "../../api/client"
import { useAuth } from "../../context/AuthContext"
import { useToast } from "../../context/ToastContext"
import { Badge } from "../ui/badge"
import { ConfirmDialog } from "../ui/confirmDialog"

export function RoomHistoryList() {
  const { token } = useAuth()
  const toast = useToast()
  const [rooms, setRooms] = useState<RoomHistoryEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [roomPendingDeletion, setRoomPendingDeletion] =
    useState<RoomHistoryEntry | null>(null)

  useEffect(() => {
    if (!token) return
    api
      .get<RoomHistoryResponse>("/api/auth/me/rooms", token)
      .then((data) => setRooms(data.rooms))
      .catch((err) => {
        setFailed(true)
        toast.error(err instanceof Error ? err.message : "Failed to load rooms")
      })
    // `toast` deliberately omitted: its wrapper object is a new reference
    // on every toast anywhere in the app, which would refetch on each one.
  }, [token])

  const handleConfirmDelete = () => {
    const room = roomPendingDeletion
    setRoomPendingDeletion(null)
    if (!room) return

    api
      .delete(`/api/rooms/${room.code}`, token ?? undefined)
      .then(() => {
        setRooms((current) => current?.filter((r) => r.id !== room.id) ?? current)
        toast.success("Room deleted")
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to delete room")
      })
  }

  if (failed) {
    return <p className="text-sm text-muted">Couldn&apos;t load your rooms.</p>
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
    <>
      <ul className="flex flex-col gap-1">
        {rooms.map((room) => (
          <li key={room.id} className="flex items-center gap-1">
            <Link
              href={`/room/${room.code}`}
              className="flex flex-1 items-center justify-between gap-3 rounded-sm px-2 py-1.5 hover:bg-surface-hover"
            >
              <span className="flex-1 truncate text-sm">
                {room.name ?? room.code}
              </span>
              {room.isHost && <Badge variant="primary">host</Badge>}
              <span className="font-mono text-xs text-muted">{room.code}</span>
            </Link>
            {room.isHost && (
              <button
                type="button"
                aria-label="Delete room"
                onClick={() => setRoomPendingDeletion(room)}
                className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-danger/15 hover:text-danger"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={roomPendingDeletion !== null}
        title="Delete this room?"
        description="Only works while nobody is currently in the room. This also removes the connected YouTube playlist, if any. This can't be undone."
        confirmLabel="Yes, delete room"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setRoomPendingDeletion(null)}
      />
    </>
  )
}
