import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { ParticipantWithPresence } from "@cueball/shared"
import { ParticipantList } from "./ParticipantList"

function makeParticipant(
  overrides: Partial<ParticipantWithPresence> = {},
): ParticipantWithPresence {
  return {
    id: "p1",
    roomId: "r1",
    userId: null,
    guestName: "Alex",
    isHost: false,
    joinedAt: new Date().toISOString(),
    connected: true,
    ...overrides,
  }
}

describe("ParticipantList", () => {
  it("renders a message when there are no participants", () => {
    render(<ParticipantList participants={[]} selfId={null} />)
    expect(screen.getByText("No one here yet.")).toBeInTheDocument()
  })

  it("labels the host and the current user", () => {
    const host = makeParticipant({
      id: "host-1",
      guestName: "Sam",
      isHost: true,
    })
    const guest = makeParticipant({
      id: "guest-1",
      guestName: "Riley",
      connected: false,
    })
    render(<ParticipantList participants={[host, guest]} selfId="guest-1" />)

    expect(screen.getByText("Sam")).toBeInTheDocument()
    expect(screen.getByText("host")).toBeInTheDocument()
    expect(screen.getByText("Riley")).toBeInTheDocument()
    expect(screen.getByText("you")).toBeInTheDocument()
    expect(screen.getByLabelText("disconnected")).toBeInTheDocument()
  })
})
