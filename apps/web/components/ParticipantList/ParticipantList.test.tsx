import { describe, expect, it } from "vitest"
import type { ParticipantWithPresence } from "@cueball/shared"
import { ParticipantListPageObject } from "../../test/page-objects/ParticipantListPageObject"

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
    const list = new ParticipantListPageObject({ participants: [], selfId: null })
    expect(list.emptyMessage).toBeInTheDocument()
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
    const list = new ParticipantListPageObject({
      participants: [host, guest],
      selfId: "guest-1",
    })

    expect(list.hasName("Sam")).toBe(true)
    expect(list.hostBadge).toBeInTheDocument()
    expect(list.hasName("Riley")).toBe(true)
    expect(list.selfBadge).toBeInTheDocument()
    expect(list.presenceIndicator("disconnected")).toBeInTheDocument()
  })
})
