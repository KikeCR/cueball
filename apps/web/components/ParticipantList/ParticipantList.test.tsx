import { describe, expect, it, vi } from "vitest"
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

  it("hides remove buttons from a non-host", () => {
    const host = makeParticipant({ id: "host-1", guestName: "Sam", isHost: true })
    const guest = makeParticipant({ id: "guest-1", guestName: "Riley" })
    const list = new ParticipantListPageObject({
      participants: [host, guest],
      selfId: "guest-1",
      isSelfHost: false,
      onRemove: vi.fn(),
    })

    expect(list.removeButton("Sam")).not.toBeInTheDocument()
    expect(list.removeButton("Riley")).not.toBeInTheDocument()
  })

  it("lets the host remove someone else, but not themselves", async () => {
    const onRemove = vi.fn()
    const host = makeParticipant({ id: "host-1", guestName: "Sam", isHost: true })
    const guest = makeParticipant({ id: "guest-1", guestName: "Riley" })
    const list = new ParticipantListPageObject({
      participants: [host, guest],
      selfId: "host-1",
      isSelfHost: true,
      onRemove,
    })

    expect(list.removeButton("Sam")).not.toBeInTheDocument()
    await list.clickRemove("Riley")

    expect(onRemove).toHaveBeenCalledWith("guest-1")
  })
})
