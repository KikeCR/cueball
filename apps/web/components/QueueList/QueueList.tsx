import { useEffect, useRef, useState } from "react"
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
import {
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Loader2,
  MoreVertical,
  Repeat,
  Trash2,
  Undo2,
  X,
} from "lucide-react"
import type { ParticipantWithPresence, QueueItem } from "@cueball/shared"
import { cn } from "../../utils/cn"
import { Button } from "../ui/button"
import { Switch } from "../ui/switch"

interface QueueListProps {
  queue: QueueItem[]
  participants: ParticipantWithPresence[]
  selfId: string | null
  onVote: (queueItemId: string, value: 1 | -1) => void
  onRemove: (queueItemId: string) => void
  onReorder?: (orderedQueueItemIds: string[]) => void
  onSetPlayed?: (queueItemId: string, played: boolean) => void
  /** Adds a played video back into the active queue. Separate from onSetPlayed so it can stay available in Cast-mode rooms, which otherwise leave played-state fully to the TV and don't get onSetPlayed at all. */
  onRestoreToQueue?: (queueItemId: string) => void
  onClearHistory?: () => void
  /** True once the host has manually reordered the queue. */
  manualOrderActive?: boolean
  /** When on, finishing the last unplayed video restarts the whole played history as a fresh lap. */
  repeatEnabled?: boolean
  onSetRepeat?: (enabled: boolean) => void
  /** True while a drag-reorder is being confirmed against the real YouTube playlist. */
  reordering?: boolean
  /** True while a Cast-mode "repeat the queue" restart is pushing the replayed lap back onto the live TV queue — a multi-second, multi-request process that would otherwise look stalled. */
  repeating?: boolean
  /** A Cast-mode room's currently-playing item — already on the TV, so it's hidden from the queue rather than shown as just another upcoming video. Always null for playlist-sync rooms. */
  excludeQueueItemId?: string | null
}

export function QueueList({
  queue,
  participants,
  selfId,
  onVote,
  onRemove,
  onReorder,
  onSetPlayed,
  onRestoreToQueue,
  onClearHistory,
  manualOrderActive = false,
  repeatEnabled = false,
  onSetRepeat,
  reordering = false,
  repeating = false,
  excludeQueueItemId = null,
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
  const canReorder = Boolean(self?.isHost && onReorder) && !reordering

  const upcoming = queue.filter(
    (item) => !item.playedAt && item.id !== excludeQueueItemId,
  )
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
    <ol
      className={cn(
        "flex flex-col gap-3",
        (reordering || repeating) && "opacity-60",
      )}
    >
      {reordering && (
        <li className="flex items-center gap-1.5 rounded-md border border-border bg-surface-hover px-3 py-2 text-xs text-muted">
          <Loader2 className="size-3.5 animate-spin" /> Updating the YouTube
          playlist order…
        </li>
      )}
      {repeating && (
        <li className="flex items-center gap-1.5 rounded-md border border-border bg-surface-hover px-3 py-2 text-xs text-muted">
          <Loader2 className="size-3.5 animate-spin" /> Restarting the
          queue…
        </li>
      )}
      {manualOrderActive && (
        <li className="rounded-md border border-border bg-surface-hover px-3 py-2 text-xs text-muted">
          {self?.isHost
            ? "You set a custom order, any vote switches it back to vote order."
            : "The host set a custom order. Voting will switch it back to vote order."}
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

              {canModerate && (
                <QueueItemActionsMenu
                  onMarkPlayed={
                    onSetPlayed ? () => onSetPlayed(item.id, true) : undefined
                  }
                  onRemove={() => onRemove(item.id)}
                />
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
              Played videos
            </h3>
            <div className="flex items-center gap-3">
              {self?.isHost && onSetRepeat && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                  <Repeat className="size-3.5" /> Repeat
                  <Switch
                    checked={repeatEnabled}
                    onChange={onSetRepeat}
                    label="Repeat the queue once everything's played"
                  />
                </div>
              )}
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

                  {canModerate && onRestoreToQueue && (
                    <button
                      type="button"
                      aria-label="Mark as not played"
                      onClick={() => onRestoreToQueue(item.id)}
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

/**
 * One consistent trigger per row instead of separate mark-played/remove
 * buttons — a row with only one of those (or neither) used to leave a
 * reserved-but-empty gap next to the vote arrows, which read as a layout
 * bug rather than "you can't do anything here." Not rendering this at all
 * when there's nothing to do (see the canModerate check at the call site)
 * means those rows are simply a little narrower instead.
 */
function QueueItemActionsMenu({
  onMarkPlayed,
  onRemove,
}: {
  onMarkPlayed?: () => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="Video actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-text",
          open && "bg-surface-hover text-text",
        )}
      >
        <MoreVertical className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-40 overflow-hidden rounded-md border border-border bg-surface py-1 shadow-lg">
          {onMarkPlayed && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onMarkPlayed()
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text transition-colors hover:bg-upvote/15 hover:text-upvote"
            >
              <Check className="size-3.5" /> Mark as played
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onRemove()
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text transition-colors hover:bg-danger/15 hover:text-danger"
          >
            <X className="size-3.5" /> Remove from queue
          </button>
        </div>
      )}
    </div>
  )
}
