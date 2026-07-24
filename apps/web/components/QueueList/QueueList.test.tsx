import { describe, expect, it, vi } from "vitest"
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
})
