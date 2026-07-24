import { ChevronDown, ChevronUp, X } from "lucide-react"
import type { ParticipantWithPresence, QueueItem } from "@cueball/shared"
import { cn } from "../../utils/cn"

interface QueueListProps {
  queue: QueueItem[]
  participants: ParticipantWithPresence[]
  selfId: string | null
  onVote: (queueItemId: string, value: 1 | -1) => void
  onRemove: (queueItemId: string) => void
}

export function QueueList({
  queue,
  participants,
  selfId,
  onVote,
  onRemove,
}: QueueListProps) {
  if (queue.length === 0) {
    return (
      <p className="text-sm text-muted">
        The queue is empty. Add a video to get started.
      </p>
    )
  }

  const self = selfId
    ? (participants.find((p) => p.id === selfId) ?? null)
    : null

  return (
    <ol className="flex flex-col gap-3">
      {queue.map((item) => {
        const addedBy = participants.find(
          (p) => p.id === item.addedByParticipantId,
        )
        const myVote = selfId
          ? (item.votes.find((v) => v.participantId === selfId)?.value ?? null)
          : null
        const canRemove =
          self !== null &&
          (self.id === item.addedByParticipantId || self.isHost)

        return (
          <li
            key={item.id}
            className="flex items-center gap-3 rounded-md border border-border bg-surface p-2"
          >
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt=""
                width={80}
                height={45}
                className="h-[45px] w-20 shrink-0 rounded-sm bg-surface-hover object-cover"
              />
            ) : (
              <div className="h-[45px] w-20 shrink-0 rounded-sm bg-surface-hover" />
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text">
                {item.title}
              </p>
              <p className="text-xs text-muted">
                added by {addedBy?.guestName ?? "someone"}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-center gap-0.5">
              <button
                type="button"
                aria-label="Upvote"
                aria-pressed={myVote === 1}
                onClick={() => onVote(item.id, 1)}
                className={cn(
                  "rounded-md border border-border p-1.5 text-muted transition-colors hover:bg-surface-hover",
                  myVote === 1 && "border-upvote bg-upvote/15 text-upvote",
                )}
              >
                <ChevronUp className="size-4" />
              </button>
              <span
                className="text-sm font-bold tabular-nums"
                aria-label="score"
              >
                {item.score}
              </span>
              <button
                type="button"
                aria-label="Downvote"
                aria-pressed={myVote === -1}
                onClick={() => onVote(item.id, -1)}
                className={cn(
                  "rounded-md border border-border p-1.5 text-muted transition-colors hover:bg-surface-hover",
                  myVote === -1 &&
                    "border-downvote bg-downvote/15 text-downvote",
                )}
              >
                <ChevronDown className="size-4" />
              </button>
            </div>

            {canRemove && (
              <button
                type="button"
                aria-label="Remove from queue"
                onClick={() => onRemove(item.id)}
                className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-danger/15 hover:text-danger"
              >
                <X className="size-4" />
              </button>
            )}
          </li>
        )
      })}
    </ol>
  )
}
