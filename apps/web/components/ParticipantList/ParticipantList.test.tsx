import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
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

  it("only shows the edit-name control for yourself", () => {
    const host = makeParticipant({ id: "host-1", guestName: "Sam", isHost: true })
    const guest = makeParticipant({ id: "guest-1", guestName: "Riley" })
    const list = new ParticipantListPageObject({
      participants: [host, guest],
      selfId: "guest-1",
      onRename: vi.fn(),
    })

    expect(list.editNameButton).toBeInTheDocument()
    // Only one edit control should exist (for "you"), not one per participant.
    expect(screen.getAllByRole("button", { name: "Edit your name" })).toHaveLength(1)
  })

  it("lets you rename yourself", async () => {
    const onRename = vi.fn()
    const guest = makeParticipant({ id: "guest-1", guestName: "Riley" })
    const list = new ParticipantListPageObject({
      participants: [guest],
      selfId: "guest-1",
      onRename,
    })

    await list.renameTo("New Name")

    expect(onRename).toHaveBeenCalledWith("New Name")
    // The component doesn't optimistically rename itself — it just reports
    // the new name and exits edit mode; the display name only changes once
    // the parent feeds back an updated `participants` prop.
    expect(list.nameInput).not.toBeInTheDocument()
  })

  it("discards the edit when cancelled", async () => {
    const onRename = vi.fn()
    const guest = makeParticipant({ id: "guest-1", guestName: "Riley" })
    const list = new ParticipantListPageObject({
      participants: [guest],
      selfId: "guest-1",
      onRename,
    })

    await list.startRenameAndType("Discarded")
    await list.cancelRename()

    expect(onRename).not.toHaveBeenCalled()
    expect(list.hasName("Riley")).toBe(true)
  })
})
