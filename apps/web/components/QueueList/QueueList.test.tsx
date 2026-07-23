import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { ParticipantWithPresence, QueueItem } from "@cueball/shared"
import { QueueList } from "./QueueList"

const participants: ParticipantWithPresence[] = [
  {
    id: "p1",
    roomId: "r1",
    userId: null,
    guestName: "Sam",
    isHost: true,
    joinedAt: new Date().toISOString(),
    connected: true,
  },
]

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
})
