import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ParticipantWithPresence, QueueItem } from "@cueball/shared"
import { QueueList } from "./QueueList"

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
    render(
      <QueueList
        queue={[]}
        participants={participants}
        selfId={null}
        onVote={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(screen.getByText(/queue is empty/i)).toBeInTheDocument()
  })

  it("shows the score, who added it, and calls onVote", async () => {
    const onVote = vi.fn()
    const item = makeItem({ score: 3 })
    render(
      <QueueList
        queue={[item]}
        participants={participants}
        selfId="p1"
        onVote={onVote}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getByText(/added by Sam/)).toBeInTheDocument()
    expect(screen.getByLabelText("score")).toHaveTextContent("3")

    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Upvote" }))
    expect(onVote).toHaveBeenCalledWith("q1", 1)
  })

  it("marks the upvote button pressed when the current user already upvoted", () => {
    const item = makeItem({ votes: [{ participantId: "p1", value: 1 }] })
    render(
      <QueueList
        queue={[item]}
        participants={participants}
        selfId="p1"
        onVote={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "Upvote" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    expect(screen.getByRole("button", { name: "Downvote" })).toHaveAttribute(
      "aria-pressed",
      "false",
    )
  })

  it("lets the person who added a video remove it", async () => {
    const onRemove = vi.fn()
    const item = makeItem({ addedByParticipantId: "p2" })
    render(
      <QueueList
        queue={[item]}
        participants={participants}
        selfId="p2"
        onVote={vi.fn()}
        onRemove={onRemove}
      />,
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Remove from queue" }))
    expect(onRemove).toHaveBeenCalledWith("q1")
  })

  it("lets the host remove a video someone else added", () => {
    const item = makeItem({ addedByParticipantId: "p2" })
    render(
      <QueueList
        queue={[item]}
        participants={participants}
        selfId="p1"
        onVote={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expect(
      screen.getByRole("button", { name: "Remove from queue" }),
    ).toBeInTheDocument()
  })

  it("hides the remove button from a guest who didn't add the video and isn't host", () => {
    const other: ParticipantWithPresence = {
      ...guest,
      id: "p3",
      guestName: "Alex",
    }
    const item = makeItem({ addedByParticipantId: "p2" })
    render(
      <QueueList
        queue={[item]}
        participants={[...participants, other]}
        selfId="p3"
        onVote={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole("button", { name: "Remove from queue" }),
    ).not.toBeInTheDocument()
  })
})
