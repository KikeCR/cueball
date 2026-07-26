import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../realtime.js", () => ({
  getIo: vi.fn(),
}))

import { getIo } from "../realtime.js"
import { getConnectedParticipantIds } from "./presence.js"

function fakeIo(sockets: Array<{ data: { participantId?: string } }>) {
  return {
    in: () => ({
      fetchSockets: () => Promise.resolve(sockets),
    }),
  }
}

describe("getConnectedParticipantIds", () => {
  beforeEach(() => {
    vi.mocked(getIo).mockReset()
  })

  it("returns an empty set when the io server isn't available yet", async () => {
    vi.mocked(getIo).mockReturnValue(undefined)
    const connected = await getConnectedParticipantIds("room-1")
    expect(connected).toEqual(new Set())
  })

  it("returns the participant ids of every currently-connected socket in the room", async () => {
    vi.mocked(getIo).mockReturnValue(
      fakeIo([
        { data: { participantId: "participant-1" } },
        { data: { participantId: "participant-2" } },
      ]) as never,
    )

    const connected = await getConnectedParticipantIds("room-1")
    expect(connected).toEqual(new Set(["participant-1", "participant-2"]))
  })

  it("dedupes multiple sockets (tabs) for the same participant", async () => {
    vi.mocked(getIo).mockReturnValue(
      fakeIo([
        { data: { participantId: "participant-1" } },
        { data: { participantId: "participant-1" } },
      ]) as never,
    )

    const connected = await getConnectedParticipantIds("room-1")
    expect(connected).toEqual(new Set(["participant-1"]))
  })

  it("ignores sockets with no participantId (not yet joined)", async () => {
    vi.mocked(getIo).mockReturnValue(
      fakeIo([{ data: {} }, { data: { participantId: "participant-1" } }]) as never,
    )

    const connected = await getConnectedParticipantIds("room-1")
    expect(connected).toEqual(new Set(["participant-1"]))
  })

  it("returns an empty set when nobody's connected", async () => {
    vi.mocked(getIo).mockReturnValue(fakeIo([]) as never)
    const connected = await getConnectedParticipantIds("room-1")
    expect(connected).toEqual(new Set())
  })
})
