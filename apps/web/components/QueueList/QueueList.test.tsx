import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import type { ParticipantWithPresence, QueueItem } from "@cueball/shared"
import { QueueListPageObject } from "../../test/page-objects/QueueListPageObject"

const host: ParticipantWithPresence = {
  id: "p1",
  roomId: "r1",
  userId: null,
  guestName: "Sam",
  isHost: true,
  joinedAt: new Date().toISOString(),
  connected: true,
}

const guest: ParticipantWithPresence = {
  id: "p2",
  roomId: "r1",
  userId: null,
  guestName: "Riley",
  isHost: false,
  joinedAt: new Date().toISOString(),
  connected: true,
}

const participants: ParticipantWithPresence[] = [host, guest]

function makeItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "q1",
    roomId: "r1",
    youtubeVideoId: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    thumbnailUrl: null,
    addedByParticipantId: "p1",
    score: 0,
    playedAt: null,
    createdAt: new Date().toISOString(),
    votes: [],
    ...overrides,
  }
}

describe("QueueList", () => {
  it("shows an empty state when there are no items", () => {
    const queueList = new QueueListPageObject({
      queue: [],
      participants,
      selfId: null,
      onVote: vi.fn(),
      onRemove: vi.fn(),
    })
    expect(queueList.emptyMessage).toBeInTheDocument()
  })

  it("shows the score, who added it, and calls onVote", async () => {
    const onVote = vi.fn()
    const item = makeItem({ score: 3 })
    const queueList = new QueueListPageObject({
      queue: [item],
      participants,
      selfId: "p1",
      onVote,
      onRemove: vi.fn(),
    })

    expect(queueList.hasText(/added by Sam/)).toBe(true)
    expect(queueList.score).toHaveTextContent("3")

    await queueList.clickUpvote()
    expect(onVote).toHaveBeenCalledWith("q1", 1)
  })

  it("marks the upvote button pressed when the current user already upvoted", () => {
    const item = makeItem({ votes: [{ participantId: "p1", value: 1 }] })
    const queueList = new QueueListPageObject({
      queue: [item],
      participants,
      selfId: "p1",
      onVote: vi.fn(),
      onRemove: vi.fn(),
    })

    expect(queueList.upvoteButton).toHaveAttribute("aria-pressed", "true")
    expect(queueList.downvoteButton).toHaveAttribute("aria-pressed", "false")
  })

  it("lets the person who added a video remove it", async () => {
    const onRemove = vi.fn()
    const item = makeItem({ addedByParticipantId: "p2" })
    const queueList = new QueueListPageObject({
      queue: [item],
      participants,
      selfId: "p2",
      onVote: vi.fn(),
      onRemove,
    })

    await queueList.clickRemove()
    expect(onRemove).toHaveBeenCalledWith("q1")
  })

  it("lets the host remove a video someone else added", () => {
    const item = makeItem({ addedByParticipantId: "p2" })
    const queueList = new QueueListPageObject({
      queue: [item],
      participants,
      selfId: "p1",
      onVote: vi.fn(),
      onRemove: vi.fn(),
    })

    expect(queueList.removeButton).toBeInTheDocument()
  })

  it("hides the remove button from a guest who didn't add the video and isn't host", () => {
    const other: ParticipantWithPresence = {
      ...guest,
      id: "p3",
      guestName: "Alex",
    }
    const item = makeItem({ addedByParticipantId: "p2" })
    const queueList = new QueueListPageObject({
      queue: [item],
      participants: [...participants, other],
      selfId: "p3",
      onVote: vi.fn(),
      onRemove: vi.fn(),
    })

    expect(queueList.removeButton).not.toBeInTheDocument()
  })

  it("shows drag handles for the host when reordering is wired up", () => {
    const queueList = new QueueListPageObject({
      queue: [makeItem({ id: "q1" }), makeItem({ id: "q2" })],
      participants,
      selfId: "p1",
      onVote: vi.fn(),
      onRemove: vi.fn(),
      onReorder: vi.fn(),
    })

    expect(queueList.dragHandles).toHaveLength(2)
  })

  it("hides drag handles from a non-host even when onReorder is provided", () => {
    const queueList = new QueueListPageObject({
      queue: [makeItem({ id: "q1" })],
      participants,
      selfId: "p2",
      onVote: vi.fn(),
      onRemove: vi.fn(),
      onReorder: vi.fn(),
    })

    expect(queueList.dragHandles).toHaveLength(0)
  })

  it("hides drag handles for the host when no onReorder handler is passed", () => {
    const queueList = new QueueListPageObject({
      queue: [makeItem({ id: "q1" })],
      participants,
      selfId: "p1",
      onVote: vi.fn(),
      onRemove: vi.fn(),
    })

    expect(queueList.dragHandles).toHaveLength(0)
  })

  it("pauses voting for a non-host once the host has set a manual order", () => {
    const onVote = vi.fn()
    const queueList = new QueueListPageObject({
      queue: [makeItem()],
      participants,
      selfId: "p2",
      onVote,
      onRemove: vi.fn(),
      manualOrderActive: true,
    })

    expect(queueList.upvoteButton).toBeDisabled()
    expect(queueList.downvoteButton).toBeDisabled()
    expect(queueList.hasText(/host set a custom order/i)).toBe(true)
  })

  it("still lets the host vote once they've set a manual order", () => {
    const queueList = new QueueListPageObject({
      queue: [makeItem()],
      participants,
      selfId: "p1",
      onVote: vi.fn(),
      onRemove: vi.fn(),
      manualOrderActive: true,
    })

    expect(queueList.upvoteButton).not.toBeDisabled()
    expect(queueList.downvoteButton).not.toBeDisabled()
    expect(queueList.hasText(/voting is paused for everyone else/i)).toBe(true)
  })

  it("doesn't pause voting when order is still vote-driven", () => {
    const queueList = new QueueListPageObject({
      queue: [makeItem()],
      participants,
      selfId: "p2",
      onVote: vi.fn(),
      onRemove: vi.fn(),
      manualOrderActive: false,
    })

    expect(queueList.upvoteButton).not.toBeDisabled()
    expect(queueList.downvoteButton).not.toBeDisabled()
  })

  it("lets the person who added a video mark it played", async () => {
    const onSetPlayed = vi.fn()
    const item = makeItem({ addedByParticipantId: "p2" })
    const queueList = new QueueListPageObject({
      queue: [item],
      participants,
      selfId: "p2",
      onVote: vi.fn(),
      onRemove: vi.fn(),
      onSetPlayed,
    })

    await queueList.clickMarkPlayed()
    expect(onSetPlayed).toHaveBeenCalledWith("q1", true)
  })

  it("hides the mark-played button from a bystander", () => {
    const other: ParticipantWithPresence = { ...guest, id: "p3", guestName: "Alex" }
    const item = makeItem({ addedByParticipantId: "p2" })
    const queueList = new QueueListPageObject({
      queue: [item],
      participants: [...participants, other],
      selfId: "p3",
      onVote: vi.fn(),
      onRemove: vi.fn(),
      onSetPlayed: vi.fn(),
    })

    expect(queueList.markPlayedButton).not.toBeInTheDocument()
  })

  it("moves a played item into its own dimmed section, out of the vote/drag list", () => {
    const upcoming = makeItem({ id: "q1", title: "Upcoming" })
    const alreadyPlayed = makeItem({
      id: "q2",
      title: "Already Played",
      playedAt: new Date().toISOString(),
    })
    const queueList = new QueueListPageObject({
      queue: [upcoming, alreadyPlayed],
      participants,
      selfId: "p1",
      onVote: vi.fn(),
      onRemove: vi.fn(),
      onReorder: vi.fn(),
      onSetPlayed: vi.fn(),
    })

    expect(queueList.playedHeading).toBeInTheDocument()
    expect(queueList.hasText("Already Played")).toBe(true)
    expect(queueList.hasText("Upcoming")).toBe(true)
    // Only the still-upcoming item is draggable/votable.
    expect(queueList.dragHandles).toHaveLength(1)
    expect(screen.getAllByLabelText("Upvote")).toHaveLength(1)
  })

  it("lets a played video be marked unplayed again", async () => {
    const onSetPlayed = vi.fn()
    const item = makeItem({ playedAt: new Date().toISOString() })
    const queueList = new QueueListPageObject({
      queue: [item],
      participants,
      selfId: "p1",
      onVote: vi.fn(),
      onRemove: vi.fn(),
      onSetPlayed,
    })

    await queueList.clickMarkUnplayed()
    expect(onSetPlayed).toHaveBeenCalledWith("q1", false)
  })

  it("doesn't show a played section when nothing has been played", () => {
    const queueList = new QueueListPageObject({
      queue: [makeItem()],
      participants,
      selfId: "p1",
      onVote: vi.fn(),
      onRemove: vi.fn(),
    })

    expect(queueList.playedHeading).not.toBeInTheDocument()
  })

  it("lets the host clear played history", async () => {
    const onClearHistory = vi.fn()
    const item = makeItem({ playedAt: new Date().toISOString() })
    const queueList = new QueueListPageObject({
      queue: [item],
      participants,
      selfId: "p1",
      onVote: vi.fn(),
      onRemove: vi.fn(),
      onClearHistory,
    })

    await queueList.clickClearHistory()
    expect(onClearHistory).toHaveBeenCalled()
  })

  it("hides the clear-history button from a non-host", () => {
    const item = makeItem({ playedAt: new Date().toISOString() })
    const queueList = new QueueListPageObject({
      queue: [item],
      participants,
      selfId: "p2",
      onVote: vi.fn(),
      onRemove: vi.fn(),
      onClearHistory: vi.fn(),
    })

    expect(queueList.clearHistoryButton).not.toBeInTheDocument()
  })

  it("hides the clear-history button when there's no played history", () => {
    const queueList = new QueueListPageObject({
      queue: [makeItem()],
      participants,
      selfId: "p1",
      onVote: vi.fn(),
      onRemove: vi.fn(),
      onClearHistory: vi.fn(),
    })

    expect(queueList.clearHistoryButton).not.toBeInTheDocument()
  })
})
