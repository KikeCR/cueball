import type { ParticipantWithPresence } from "@cueball/shared"
import { cn } from "../../utils/cn"
import { Badge } from "../ui/badge"

interface ParticipantListProps {
  participants: ParticipantWithPresence[]
  selfId: string | null
}

export function ParticipantList({
  participants,
  selfId,
}: ParticipantListProps) {
  if (participants.length === 0) {
    return <p className="text-sm text-muted">No one here yet.</p>
  }

  return (
    <ul className="flex flex-col gap-1">
      {participants.map((participant) => {
        const name = participant.guestName ?? "Guest"

        return (
          <li
            key={participant.id}
            className="flex items-center gap-3 rounded-sm px-2 py-1.5"
          >
            <span className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-hover text-xs font-bold text-muted">
              {name.charAt(0).toUpperCase()}
              <span
                aria-label={
                  participant.connected ? "connected" : "disconnected"
                }
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface",
                  participant.connected ? "bg-upvote" : "bg-muted",
                )}
              />
            </span>
            <span className="flex-1 truncate text-sm">{name}</span>
            {participant.isHost && <Badge variant="primary">host</Badge>}
            {participant.id === selfId && <Badge>you</Badge>}
          </li>
        )
      })}
    </ul>
  )
}
