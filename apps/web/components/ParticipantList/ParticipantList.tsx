import { X } from "lucide-react"
import type { ParticipantWithPresence } from "@cueball/shared"
import { cn } from "../../utils/cn"
import { Badge } from "../ui/badge"

interface ParticipantListProps {
  participants: ParticipantWithPresence[]
  selfId: string | null
  isSelfHost?: boolean
  onRemove?: (participantId: string) => void
}

export function ParticipantList({
  participants,
  selfId,
  isSelfHost = false,
  onRemove,
}: ParticipantListProps) {
  if (participants.length === 0) {
    return <p className="text-sm text-muted">No one here yet.</p>
  }

  return (
    <ul className="flex flex-col gap-1">
      {participants.map((participant) => {
        const name = participant.guestName ?? "Guest"
        const canRemove =
          isSelfHost && participant.id !== selfId && Boolean(onRemove)

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
            {canRemove && (
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => onRemove?.(participant.id)}
                className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-danger/15 hover:text-danger"
              >
                <X className="size-4" />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
