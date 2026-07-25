import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Check, ChevronDown, ChevronUp, GripVertical, Trash2, Undo2, X } from "lucide-react"
import type { ParticipantWithPresence, QueueItem } from "@cueball/shared"
import { cn } from "../../utils/cn"
import { Button } from "../ui/button"

interface QueueListProps {
  queue: QueueItem[]
  participants: ParticipantWithPresence[]
  selfId: string | null
  onVote: (queueItemId: string, value: 1 | -1) => void
  onRemove: (queueItemId: string) => void
  onReorder?: (orderedQueueItemIds: string[]) => void
  onSetPlayed?: (queueItemId: string, played: boolean) => void
  onClearHistory?: () => void
  /** True once the host has manually reordered the queue. */
  manualOrderActive?: boolean
}

export function QueueList({
  queue,
  participants,
  selfId,
  onVote,
  onRemove,
  onReorder,
  onSetPlayed,
  onClearHistory,
  manualOrderActive = false,
}: QueueListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  )

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
  const canReorder = Boolean(self?.isHost && onReorder)
  const votingLocked = manualOrderActive && !self?.isHost

  const upcoming = queue.filter((item) => !item.playedAt)
  const played = queue.filter((item) => item.playedAt)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = upcoming.findIndex((item) => item.id === active.id)
    const newIndex = upcoming.findIndex((item) => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    onReorder?.(
      arrayMove(upcoming, oldIndex, newIndex).map((item) => item.id),
    )
  }

  const upcomingList = (
    <ol className="flex flex-col gap-3">
      {manualOrderActive && (
        <li className="rounded-md border border-border bg-surface-hover px-3 py-2 text-xs text-muted">
          {self?.isHost
            ? "You set a custom order — voting is paused for everyone else until you vote."
            : "The host set a custom order. Voting is paused until the host votes."}
        </li>
      )}
      {upcoming.length === 0 ? (
        <li className="text-sm text-muted">
          Nothing left to play — add another video.
        </li>
      ) : (
        upcoming.map((item) => {
          const addedBy = participants.find(
            (p) => p.id === item.addedByParticipantId,
          )
          const myVote = selfId
            ? (item.votes.find((v) => v.participantId === selfId)?.value ?? null)
            : null
          const canModerate =
            self !== null &&
            (self.id === item.addedByParticipantId || self.isHost)

          return (
            <QueueListItem key={item.id} id={item.id} draggable={canReorder}>
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
                  disabled={votingLocked}
                  title={votingLocked ? "Voting is paused" : undefined}
                  onClick={() => onVote(item.id, 1)}
                  className={cn(
                    "rounded-md border border-border p-1.5 text-muted transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
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
                  disabled={votingLocked}
                  title={votingLocked ? "Voting is paused" : undefined}
                  onClick={() => onVote(item.id, -1)}
                  className={cn(
                    "rounded-md border border-border p-1.5 text-muted transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
                    myVote === -1 &&
                      "border-downvote bg-downvote/15 text-downvote",
                  )}
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>

              {canModerate && onSetPlayed && (
                <button
                  type="button"
                  aria-label="Mark as played"
                  onClick={() => onSetPlayed(item.id, true)}
                  className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-upvote/15 hover:text-upvote"
                >
                  <Check className="size-4" />
                </button>
              )}

              {canModerate && (
                <button
                  type="button"
                  aria-label="Remove from queue"
                  onClick={() => onRemove(item.id)}
                  className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                >
                  <X className="size-4" />
                </button>
              )}
            </QueueListItem>
          )
        })
      )}
    </ol>
  )

  return (
    <div className="flex flex-col gap-4">
      {canReorder ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext
            items={upcoming.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            {upcomingList}
          </SortableContext>
        </DndContext>
      ) : (
        upcomingList
      )}

      {played.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
              Played videos
            </h3>
            {self?.isHost && onClearHistory && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClearHistory}
              >
                <Trash2 className="size-3.5" /> Clear history
              </Button>
            )}
          </div>
          <ol className="flex flex-col gap-2 opacity-60">
            {played.map((item) => {
              const addedBy = participants.find(
                (p) => p.id === item.addedByParticipantId,
              )
              const canModerate =
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

                  {canModerate && onSetPlayed && (
                    <button
                      type="button"
                      aria-label="Mark as not played"
                      onClick={() => onSetPlayed(item.id, false)}
                      className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-text"
                    >
                      <Undo2 className="size-4" />
                    </button>
                  )}

                  {canModerate && (
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
        </div>
      )}
    </div>
  )
}

function QueueListItem({
  id,
  draggable,
  children,
}: {
  id: string
  draggable: boolean
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !draggable })

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "flex items-center gap-3 rounded-md border border-border bg-surface p-2",
        draggable && "select-none [-webkit-touch-callout:none]",
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      {draggable && (
        <button
          type="button"
          aria-label="Drag to reorder"
          className="shrink-0 touch-none select-none rounded-md p-2 text-muted transition-colors hover:bg-surface-hover hover:text-text active:cursor-grabbing [-webkit-touch-callout:none]"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" />
        </button>
      )}
      {children}
    </li>
  )
}
