import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../redis/youtubeQuota.js", () => ({
  recordYoutubeQuotaUsage: vi.fn(),
}))

import { recordYoutubeQuotaUsage } from "../redis/youtubeQuota.js"
import {
  buildRelatedVideosQuery,
  decodeHtmlEntities,
  fetchVideoDurationSeconds,
  fetchVideoMetadata,
  fetchVideoTagInfo,
  formatDurationClock,
  isYoutubeDataApiConfigured,
  parseIso8601DurationSeconds,
  parseYoutubeVideoId,
  searchYoutubeVideos,
  YoutubeQuotaExceededError,
  type VideoTagInfo,
} from "./youtube.js"

afterEach(() => {
  vi.mocked(recordYoutubeQuotaUsage).mockClear()
})

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

describe("decodeHtmlEntities", () => {
  it.each([
    ['Mac DeMarco // &quot;Ode To Viceroy&quot;', 'Mac DeMarco // "Ode To Viceroy"'],
    ["Rock &amp; Roll", "Rock & Roll"],
    ["It&#39;s Britney", "It's Britney"],
    ["&lt;Title&gt;", "<Title>"],
    ["Caf&#233; music", "Café music"],
    ["No entities here", "No entities here"],
  ])("decodes %s as %s", (input, expected) => {
    expect(decodeHtmlEntities(input)).toBe(expected)
  })
})

describe("searchYoutubeVideos", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("returns an empty list and skips the request when unconfigured", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    expect(await searchYoutubeVideos("rick astley")).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("records quota usage for a successful call", async () => {
    vi.mocked(recordYoutubeQuotaUsage).mockReset()
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ items: [] }) }),
    )

    await searchYoutubeVideos("rick astley")

    expect(recordYoutubeQuotaUsage).toHaveBeenCalledWith(100)
  })

  it("throws a distinguishable error when the daily quota is exceeded", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({
            error: { errors: [{ reason: "quotaExceeded" }] },
          }),
      }),
    )

    await expect(searchYoutubeVideos("rick astley")).rejects.toBeInstanceOf(
      YoutubeQuotaExceededError,
    )
  })

  it("maps search results, preferring the medium thumbnail", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [
            {
              id: { videoId: "dQw4w9WgXcQ" },
              snippet: {
                title: "Never Gonna Give You Up",
                channelTitle: "Rick Astley",
                thumbnails: {
                  default: { url: "https://i.ytimg.com/default.jpg" },
                  medium: { url: "https://i.ytimg.com/medium.jpg" },
                },
              },
            },
          ],
        }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await searchYoutubeVideos("rick astley")

    expect(result).toEqual([
      {
        videoId: "dQw4w9WgXcQ",
        title: "Never Gonna Give You Up",
        thumbnailUrl: "https://i.ytimg.com/medium.jpg",
        channelTitle: "Rick Astley",
      },
    ])
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8&q=rick%20astley&key=test-key",
      ),
    )
  })

  it("decodes HTML entities in the title and channel name", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: { videoId: "abc" },
                snippet: {
                  title: "Mac DeMarco // &quot;Ode To Viceroy&quot;",
                  channelTitle: "Rock &amp; Roll Hall of Fame",
                  thumbnails: {},
                },
              },
            ],
          }),
      }),
    )

    const result = await searchYoutubeVideos("ode to viceroy")

    expect(result[0]?.title).toBe('Mac DeMarco // "Ode To Viceroy"')
    expect(result[0]?.channelTitle).toBe("Rock & Roll Hall of Fame")
  })

  it("falls back to the default thumbnail when no medium size is present", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: { videoId: "abc" },
                snippet: {
                  title: "Some Video",
                  channelTitle: "Some Channel",
                  thumbnails: { default: { url: "https://i.ytimg.com/default.jpg" } },
                },
              },
            ],
          }),
      }),
    )

    const result = await searchYoutubeVideos("query")
    expect(result[0]?.thumbnailUrl).toBe("https://i.ytimg.com/default.jpg")
  })

  it("skips results with no videoId (e.g. channels/playlists slipping through)", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                id: {},
                snippet: {
                  title: "Not a video",
                  channelTitle: "Someone",
                  thumbnails: {},
                },
              },
            ],
          }),
      }),
    )

    expect(await searchYoutubeVideos("query")).toEqual([])
  })

  it("throws when the API request fails", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }))

    await expect(searchYoutubeVideos("query")).rejects.toThrow(
      "YouTube search failed with status 403",
    )
  })
})

describe("fetchVideoTagInfo", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("returns an empty list and skips the request when unconfigured", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    expect(await fetchVideoTagInfo(["abc"])).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns an empty list and skips the request when there are no video ids", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    expect(await fetchVideoTagInfo([])).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("batches every id into a single call", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [
            { id: "abc", snippet: { title: "Song A", tags: ["indie", "rock"] } },
            { id: "def", snippet: { title: "Song B" } },
          ],
        }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchVideoTagInfo(["abc", "def"])

    expect(result).toEqual([
      { videoId: "abc", title: "Song A", tags: ["indie", "rock"] },
      { videoId: "def", title: "Song B", tags: [] },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://www.googleapis.com/youtube/v3/videos?part=snippet&id=abc%2Cdef&key=test-key",
      ),
    )
  })

  it("returns an empty list when the request fails", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))

    expect(await fetchVideoTagInfo(["abc"])).toEqual([])
  })
})

describe("buildRelatedVideosQuery", () => {
  function video(overrides: Partial<VideoTagInfo> = {}): VideoTagInfo {
    return { videoId: "abc", title: "Some Video", tags: [], ...overrides }
  }

  it("returns an empty string for no videos", () => {
    expect(buildRelatedVideosQuery([])).toBe("")
  })

  it("prefers the most frequent tags across every video, not just one", () => {
    const videos = [
      video({ tags: ["indie rock", "lofi"] }),
      video({ tags: ["indie rock", "chill"] }),
      video({ tags: ["indie rock"] }),
    ]

    expect(buildRelatedVideosQuery(videos)).toBe("indie rock lofi chill")
  })

  it("caps at the top 5 tags", () => {
    const videos = [
      video({ tags: ["a", "a", "b", "b", "c", "c", "d", "d", "e", "e", "f", "f"] }),
    ]

    expect(buildRelatedVideosQuery(videos).split(" ")).toHaveLength(5)
  })

  it("falls back to title words when fewer than 2 distinct tags exist", () => {
    const videos = [
      video({ title: "Amazing Official Lyrics Video", tags: [] }),
      video({ title: "Amazing Live Performance", tags: ["amazing"] }),
    ]

    const query = buildRelatedVideosQuery(videos)
    // "amazing" is the sole tag, plus title words with stopwords/generic
    // terms (official, lyrics, video) filtered out.
    expect(query).toContain("amazing")
    expect(query).toContain("live")
    expect(query).toContain("performance")
    expect(query).not.toContain("official")
    expect(query).not.toContain("video")
  })

  it("ignores short and stopword title words in the fallback", () => {
    const videos = [video({ title: "In the of a to HD 4K" })]

    expect(buildRelatedVideosQuery(videos)).toBe("")
  })
})
