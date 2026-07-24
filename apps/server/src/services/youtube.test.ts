import { afterEach, describe, expect, it, vi } from "vitest"
import {
  fetchVideoDurationSeconds,
  fetchVideoMetadata,
  formatDurationClock,
  isYoutubeDataApiConfigured,
  parseIso8601DurationSeconds,
  parseYoutubeVideoId,
} from "./youtube.js"

describe("parseYoutubeVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s", "dQw4w9WgXcQ"],
    // Auto-playing "up next" radio/mix params must not leak into the id.
    [
      "https://www.youtube.com/watch?v=MVh6XTwWhMY&list=RDMVh6XTwWhMY&start_radio=1",
      "MVh6XTwWhMY",
    ],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=30", "dQw4w9WgXcQ"],
    [
      "https://youtu.be/dQw4w9WgXcQ?list=RDdQw4w9WgXcQ&start_radio=1",
      "dQw4w9WgXcQ",
    ],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("extracts the video id from %s", (url, expected) => {
    expect(parseYoutubeVideoId(url)).toBe(expected)
  })

  it.each([
    ["not a url", "garbage input"],
    ["https://example.com/watch?v=dQw4w9WgXcQ", "wrong host"],
    ["https://www.youtube.com/watch?v=short", "video id too short"],
    ["https://www.youtube.com/", "no video id in path or query"],
    ["https://www.youtube.com/watch", "missing v param"],
  ])("returns null for %s (%s)", (url) => {
    expect(parseYoutubeVideoId(url)).toBeNull()
  })
})

describe("fetchVideoMetadata", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns the title and thumbnail from a successful oEmbed response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          title: "Some Video",
          thumbnail_url: "https://i.ytimg.com/thumb.jpg",
        }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchVideoMetadata("dQw4w9WgXcQ")

    expect(result).toEqual({
      title: "Some Video",
      thumbnailUrl: "https://i.ytimg.com/thumb.jpg",
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://www.youtube.com/oembed?url="),
    )
  })

  it("returns null when the video doesn't exist (oEmbed 404s)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))

    const result = await fetchVideoMetadata("doesNotExist")

    expect(result).toBeNull()
  })
})

describe("parseIso8601DurationSeconds", () => {
  it.each([
    ["PT45S", 45],
    ["PT12M34S", 754],
    ["PT1H2M3S", 3723],
    ["PT1H", 3600],
    ["PT20M", 1200],
  ])("parses %s as %i seconds", (duration, expected) => {
    expect(parseIso8601DurationSeconds(duration)).toBe(expected)
  })

  it("returns null for a non-duration string", () => {
    expect(parseIso8601DurationSeconds("garbage")).toBeNull()
  })
})

describe("formatDurationClock", () => {
  it.each([
    [45, "0:45"],
    [754, "12:34"],
    [3723, "62:03"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatDurationClock(seconds)).toBe(expected)
  })
})

describe("isYoutubeDataApiConfigured / fetchVideoDurationSeconds", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("is unconfigured and fails open when no API key is set", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    expect(isYoutubeDataApiConfigured()).toBe(false)
    expect(await fetchVideoDurationSeconds("dQw4w9WgXcQ")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("fetches and parses the duration when configured", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ items: [{ contentDetails: { duration: "PT14M32S" } }] }),
    })
    vi.stubGlobal("fetch", fetchMock)

    expect(isYoutubeDataApiConfigured()).toBe(true)
    const result = await fetchVideoDurationSeconds("dQw4w9WgXcQ")

    expect(result).toBe(872)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=dQw4w9WgXcQ&key=test-key",
      ),
    )
  })

  it("returns null when the API request fails", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))

    expect(await fetchVideoDurationSeconds("dQw4w9WgXcQ")).toBeNull()
  })

  it("returns null when no items are returned (video not found)", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      }),
    )

    expect(await fetchVideoDurationSeconds("missing")).toBeNull()
  })
})
