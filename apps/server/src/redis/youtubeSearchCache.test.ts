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
  getCachedSearchResults,
  setCachedSearchResults,
} from "./youtubeSearchCache.js"

const sampleResults: YoutubeSearchResult[] = [
  {
    videoId: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    thumbnailUrl: "https://i.ytimg.com/thumb.jpg",
    channelTitle: "Rick Astley",
  },
]

describe("youtubeSearchCache", () => {
  beforeEach(() => {
    vi.mocked(redis.get).mockReset()
    vi.mocked(redis.set).mockReset()
  })

  it("stores results as JSON with an expiry, keyed by a normalized query", async () => {
    await setCachedSearchResults("  Rick Astley  ", sampleResults)
    expect(redis.set).toHaveBeenCalledWith(
      "youtube-search:rick astley",
      JSON.stringify(sampleResults),
      "EX",
      60 * 60,
    )
  })

  it("returns parsed results for a case/whitespace-insensitive match", async () => {
    vi.mocked(redis.get).mockResolvedValue(JSON.stringify(sampleResults))
    const result = await getCachedSearchResults("  RICK ASTLEY  ")
    expect(redis.get).toHaveBeenCalledWith("youtube-search:rick astley")
    expect(result).toEqual(sampleResults)
  })

  it("returns null when nothing is cached", async () => {
    vi.mocked(redis.get).mockResolvedValue(null)
    expect(await getCachedSearchResults("rick astley")).toBeNull()
  })

  it("keys a category-filtered search separately from an unfiltered one", async () => {
    await setCachedSearchResults("rick astley", sampleResults, "10")
    expect(redis.set).toHaveBeenCalledWith(
      "youtube-search:rick astley:cat10",
      JSON.stringify(sampleResults),
      "EX",
      60 * 60,
    )

    await getCachedSearchResults("rick astley", "10")
    expect(redis.get).toHaveBeenCalledWith("youtube-search:rick astley:cat10")
  })
})
