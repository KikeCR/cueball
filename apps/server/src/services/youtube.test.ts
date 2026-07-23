import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchVideoMetadata, parseYoutubeVideoId } from "./youtube.js"

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
