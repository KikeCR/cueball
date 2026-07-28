import { beforeEach, describe, expect, it, vi } from "vitest"
import type { YoutubeSearchResult } from "../services/youtube.js"

vi.mock("./client.js", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}))

import { redis } from "./client.js"
import {
  getRelatedVideosState,
  setRelatedVideosState,
} from "./relatedVideosSession.js"

const sampleResults: YoutubeSearchResult[] = [
  {
    videoId: "abc123",
    title: "Some Song",
    thumbnailUrl: null,
    channelTitle: "Some Channel",
  },
]

describe("relatedVideosSession", () => {
  beforeEach(() => {
    vi.mocked(redis.get).mockReset()
    vi.mocked(redis.set).mockReset()
  })

  it("stores the results as JSON with an expiry", async () => {
    await setRelatedVideosState("room-1", sampleResults)
    expect(redis.set).toHaveBeenCalledWith(
      "room:room-1:related-videos",
      JSON.stringify(sampleResults),
      "EX",
      60 * 60 * 6,
    )
  })

  it("returns the parsed results when present", async () => {
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(sampleResults))
    expect(await getRelatedVideosState("room-1")).toEqual(sampleResults)
  })

  it("returns null when nothing is stored", async () => {
    vi.mocked(redis.get).mockResolvedValue(null)
    expect(await getRelatedVideosState("room-1")).toBeNull()
  })
})
