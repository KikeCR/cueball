import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CastSessionState } from "@cueball/shared"

vi.mock("./client.js", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}))

import { redis } from "./client.js"
import { clearCastState, getCastState, setCastState } from "./castSession.js"

const sampleState: CastSessionState = {
  connected: true,
  deviceName: "Living Room TV",
  casterParticipantId: "participant-1",
  isPlaying: true,
  currentQueueItemId: "item-1",
  currentTimeSeconds: 42,
  durationSeconds: 213,
}

describe("castSession", () => {
  beforeEach(() => {
    vi.mocked(redis.get).mockReset()
    vi.mocked(redis.set).mockReset()
    vi.mocked(redis.del).mockReset()
  })

  it("stores the session state as JSON with an expiry", async () => {
    await setCastState("room-1", sampleState)
    expect(redis.set).toHaveBeenCalledWith(
      "room:room-1:cast",
      JSON.stringify(sampleState),
      "EX",
      60 * 60 * 6,
    )
  })

  it("returns the parsed state when present", async () => {
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(sampleState))
    const result = await getCastState("room-1")
    expect(result).toEqual(sampleState)
  })

  it("returns null when no session is stored", async () => {
    vi.mocked(redis.get).mockResolvedValue(null)
    const result = await getCastState("room-1")
    expect(result).toBeNull()
  })

  it("deletes the key on clear", async () => {
    await clearCastState("room-1")
    expect(redis.del).toHaveBeenCalledWith("room:room-1:cast")
  })
})
