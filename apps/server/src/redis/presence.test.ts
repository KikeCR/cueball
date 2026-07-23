import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./client.js", () => ({
  redis: {
    hincrby: vi.fn(),
    hdel: vi.fn(),
    hgetall: vi.fn(),
  },
}))

import { redis } from "./client.js"
import {
  getConnectedParticipantIds,
  markConnected,
  markDisconnected,
} from "./presence.js"

describe("presence", () => {
  beforeEach(() => {
    vi.mocked(redis.hincrby).mockReset()
    vi.mocked(redis.hdel).mockReset()
    vi.mocked(redis.hgetall).mockReset()
  })

  it("increments the connection count on connect", async () => {
    await markConnected("room-1", "participant-1")
    expect(redis.hincrby).toHaveBeenCalledWith(
      "room:room-1:presence",
      "participant-1",
      1,
    )
  })

  it("decrements on disconnect but keeps the field while other tabs are still connected", async () => {
    vi.mocked(redis.hincrby).mockResolvedValue(1)
    await markDisconnected("room-1", "participant-1")
    expect(redis.hincrby).toHaveBeenCalledWith(
      "room:room-1:presence",
      "participant-1",
      -1,
    )
    expect(redis.hdel).not.toHaveBeenCalled()
  })

  it("removes the field once the last tab disconnects", async () => {
    vi.mocked(redis.hincrby).mockResolvedValue(0)
    await markDisconnected("room-1", "participant-1")
    expect(redis.hdel).toHaveBeenCalledWith(
      "room:room-1:presence",
      "participant-1",
    )
  })

  it("only reports participants with a positive connection count", async () => {
    vi.mocked(redis.hgetall).mockResolvedValue({
      "participant-1": "2",
      "participant-2": "0",
    })
    const connected = await getConnectedParticipantIds("room-1")
    expect(connected).toEqual(new Set(["participant-1"]))
  })
})
