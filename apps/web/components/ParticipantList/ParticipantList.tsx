import { useState, type FormEvent } from "react"
import { Check, Pencil, Star, X } from "lucide-react"
import { MAX_NAME_LENGTH, type ParticipantWithPresence } from "@cueball/shared"
import { cn } from "../../utils/cn"
import { Badge } from "../ui/badge"

interface ParticipantListProps {
  participants: ParticipantWithPresence[]
  selfId: string | null
  isSelfHost?: boolean
  onRemove?: (participantId: string) => void
  onRename?: (name: string) => void
  onPromote?: (participantId: string) => void
}

export function ParticipantList({
  participants,
  selfId,
  isSelfHost = false,
  onRemove,
  onRename,
  onPromote,
}: ParticipantListProps) {
  const [editingName, setEditingName] = useState<string | null>(null)

  if (participants.length === 0) {
    return <p className="text-sm text-muted">No one here yet.</p>
  }

  const startEditing = (currentName: string) => {
    setEditingName(currentName)
  }

  const submitRename = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = editingName?.trim()
    if (trimmed) onRename?.(trimmed)
    setEditingName(null)
  }

  return (
    <ul className="flex flex-col gap-1">
      {participants.map((participant) => {
        const name = participant.guestName ?? "Guest"
        const isSelf = participant.id === selfId
        const canRemove = isSelfHost && !isSelf && Boolean(onRemove)
        const canRename = isSelf && Boolean(onRename)
        const canPromote =
          isSelfHost && !participant.isHost && Boolean(onPromote)
        const isEditing = canRename && editingName !== null

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

            {isEditing ? (
              <form
                onSubmit={submitRename}
                className="flex flex-1 items-center gap-1.5"
              >
                <input
                  autoFocus
                  value={editingName ?? ""}
                  onChange={(event) => setEditingName(event.target.value)}
                  maxLength={MAX_NAME_LENGTH}
                  aria-label="Your name"
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <button
                  type="submit"
                  aria-label="Save name"
                  className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-upvote/15 hover:text-upvote"
                >
                  <Check className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Cancel"
                  onClick={() => setEditingName(null)}
                  className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                >
                  <X className="size-4" />
                </button>
              </form>
            ) : (
              <>
                <span className="flex-1 truncate text-sm">{name}</span>
                {participant.isHost && <Badge variant="primary">host</Badge>}
                {isSelf && <Badge>you</Badge>}
                {canRename && (
                  <button
                    type="button"
                    aria-label="Edit your name"
                    onClick={() => startEditing(name)}
                    className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-text"
                  >
                    <Pencil className="size-4" />
                  </button>
                )}
                {canPromote && (
                  <button
                    type="button"
                    aria-label={`Make ${name} a host`}
                    title="Make host"
                    onClick={() => onPromote?.(participant.id)}
                    className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-primary/15 hover:text-primary"
                  >
                    <Star className="size-4" />
                  </button>
                )}
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
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}
