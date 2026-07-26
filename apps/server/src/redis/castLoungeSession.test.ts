import { beforeEach, describe, expect, it, vi } from "vitest"
import type { LoungeSessionState } from "../services/youtubeLounge.js"

vi.mock("./client.js", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}))

import { redis } from "./client.js"
import {
  clearLoungeSessionState,
  getLoungeSessionState,
  setLoungeSessionState,
} from "./castLoungeSession.js"

const sampleState: LoungeSessionState = {
  screenId: "screen-1",
  loungeToken: "lounge-token",
  sid: "sid-1",
  gsessionid: "gsession-1",
  rid: 3,
  reqCount: 2,
}

describe("castLoungeSession", () => {
  beforeEach(() => {
    vi.mocked(redis.get).mockReset()
    vi.mocked(redis.set).mockReset()
    vi.mocked(redis.del).mockReset()
  })

  it("stores the session state as JSON with an expiry", async () => {
    await setLoungeSessionState("room-1", sampleState)
    expect(redis.set).toHaveBeenCalledWith(
      "room:room-1:lounge",
      JSON.stringify(sampleState),
      "EX",
      60 * 60 * 6,
    )
  })

  it("returns the parsed state when present", async () => {
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(sampleState))
    expect(await getLoungeSessionState("room-1")).toEqual(sampleState)
  })

  it("returns null when nothing is stored", async () => {
    vi.mocked(redis.get).mockResolvedValue(null)
    expect(await getLoungeSessionState("room-1")).toBeNull()
  })

  it("deletes the key on clear", async () => {
    await clearLoungeSessionState("room-1")
    expect(redis.del).toHaveBeenCalledWith("room:room-1:lounge")
  })
})
