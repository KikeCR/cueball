import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../redis/youtubeQuota.js", () => ({
  recordYoutubeQuotaUsage: vi.fn(),
}))

import { recordYoutubeQuotaUsage } from "../redis/youtubeQuota.js"
import {
  buildRelatedVideosQuery,
  decodeHtmlEntities,
  fetchVideoDurationSeconds,
  fetchVideoDurationsSeconds,
  fetchVideoMetadata,
  fetchVideoTagInfo,
  formatDurationClock,
  groupVideosByTagCluster,
  isLikelyDuplicateTitle,
  isYoutubeDataApiConfigured,
  looksLikeNonMusicContent,
  normalizeTitleForDedup,
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

describe("fetchVideoDurationsSeconds", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("returns an empty map and skips the request when unconfigured", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    expect(await fetchVideoDurationsSeconds(["abc"])).toEqual(new Map())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns an empty map and skips the request when there are no video ids", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    expect(await fetchVideoDurationsSeconds([])).toEqual(new Map())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("batches every id into a single call and parses each duration", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [
            { id: "short", contentDetails: { duration: "PT3M20S" } },
            { id: "long", contentDetails: { duration: "PT12M0S" } },
          ],
        }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchVideoDurationsSeconds(["short", "long"])

    expect(result).toEqual(
      new Map([
        ["short", 200],
        ["long", 720],
      ]),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=short%2Clong&key=test-key",
      ),
    )
  })

  it("returns an empty map when the request fails", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }))

    expect(await fetchVideoDurationsSeconds(["abc"])).toEqual(new Map())
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

  it("includes videoCategoryId in the request when given", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await searchYoutubeVideos("city pop", { videoCategoryId: "10" })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("&videoCategoryId=10&"),
    )
  })

  it("omits videoCategoryId from the request when not given", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key")
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [] }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await searchYoutubeVideos("city pop")

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).not.toContain("videoCategoryId")
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
            {
              id: "abc",
              snippet: { title: "Song A", tags: ["indie", "rock"], categoryId: "10" },
            },
            { id: "def", snippet: { title: "Song B" } },
          ],
        }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await fetchVideoTagInfo(["abc", "def"])

    expect(result).toEqual([
      { videoId: "abc", title: "Song A", tags: ["indie", "rock"], categoryId: "10" },
      { videoId: "def", title: "Song B", tags: [], categoryId: null },
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
    return {
      videoId: "abc",
      title: "Some Video",
      tags: [],
      categoryId: null,
      ...overrides,
    }
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

describe("groupVideosByTagCluster", () => {
  function video(overrides: Partial<VideoTagInfo> = {}): VideoTagInfo {
    return {
      videoId: `video-${Math.random()}`,
      title: "Some Video",
      tags: [],
      categoryId: null,
      ...overrides,
    }
  }

  it("returns nothing for no videos", () => {
    expect(groupVideosByTagCluster([])).toEqual([])
  })

  it("splits a genre-mixed queue into a query per genre instead of one blended query", () => {
    const cityPop = [
      video({ videoId: "v1", tags: ["City Pop", "Tatsuro Yamashita"] }),
      video({ videoId: "v2", tags: ["City Pop", "Mariya Takeuchi"] }),
      video({ videoId: "v3", tags: ["City Pop", "Anri"] }),
    ]
    const indieRock = [
      video({ videoId: "v4", tags: ["Indie Rock", "Arctic Monkeys"] }),
      video({ videoId: "v5", tags: ["Indie Rock", "The Last Shadow Puppets"] }),
    ]

    const groups = groupVideosByTagCluster([...cityPop, ...indieRock])

    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.query)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("city pop"),
        expect.stringContaining("indie rock"),
      ]),
    )
  })

  it("caps at 3 groups even with more distinct clusters", () => {
    const clusters = ["a", "b", "c", "d"].map((tag) => [
      video({ tags: [tag] }),
      video({ tags: [tag] }),
    ])
    const videos = clusters.flat()

    expect(groupVideosByTagCluster(videos)).toHaveLength(3)
  })

  it("picks the cluster the injected random source points to, not always the same one", () => {
    const videos = [
      video({ tags: ["red"], title: "Red Song" }),
      video({ tags: ["red"], title: "Red Song" }),
      video({ tags: ["blue"], title: "Blue Song" }),
      video({ tags: ["blue"], title: "Blue Song" }),
    ]

    const pickFirst = groupVideosByTagCluster(videos, () => 0)
    const pickSecond = groupVideosByTagCluster(videos, () => 0.99)

    expect(pickFirst[0]?.query).toContain("red")
    expect(pickSecond[0]?.query).toContain("blue")
  })

  it("doesn't always surface the same clusters when there are more than the cap allows", () => {
    const clusterNames: Array<[string, string]> = [
      ["alpha", "Alpha Song"],
      ["bravo", "Bravo Song"],
      ["charlie", "Charlie Song"],
      ["delta", "Delta Song"],
    ]
    const clusters = clusterNames.map(([tag, title]) => [
      video({ tags: [tag], title }),
      video({ tags: [tag], title }),
    ])
    const videos = clusters.flat()

    const queriesA = groupVideosByTagCluster(videos, () => 0).map((g) => g.query)
    const queriesB = groupVideosByTagCluster(videos, () => 0.99).map((g) => g.query)

    expect(queriesA).not.toEqual(queriesB)
  })

  it("defaults to Math.random when no random source is given", () => {
    const randomSpy = vi.spyOn(Math, "random")
    const videos = [
      video({ tags: ["red"] }),
      video({ tags: ["red"] }),
      video({ tags: ["blue"] }),
      video({ tags: ["blue"] }),
    ]

    groupVideosByTagCluster(videos)

    expect(randomSpy).toHaveBeenCalled()
    randomSpy.mockRestore()
  })

  it("doesn't cluster on a tag only one video has", () => {
    const videos = [
      video({ videoId: "v1", tags: ["unique-to-v1"] }),
      video({ videoId: "v2", tags: ["unique-to-v2"] }),
    ]

    // Neither tag is shared, so both videos fall through to one catch-all
    // group instead of (incorrectly) being split by a non-shared tag.
    expect(groupVideosByTagCluster(videos)).toHaveLength(1)
  })

  it("bundles ungrouped leftovers into one final catch-all group", () => {
    const shared = [
      video({ videoId: "v1", tags: ["shared"] }),
      video({ videoId: "v2", tags: ["shared"] }),
    ]
    const leftover = video({ videoId: "v3", tags: ["solo-tag"] })

    const groups = groupVideosByTagCluster([...shared, leftover])

    expect(groups).toHaveLength(2)
  })

  it("falls back to title words for a group with no usable tags", () => {
    const videos = [
      video({ title: "Amazing Live Performance", tags: [] }),
      video({ title: "Amazing Studio Session", tags: [] }),
    ]

    const groups = groupVideosByTagCluster(videos)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.query).toContain("amazing")
  })

  it("tags a group with its videos' shared category, so search stays on-topic", () => {
    const videos = [
      video({ tags: ["city pop"], categoryId: "10" }),
      video({ tags: ["city pop"], categoryId: "10" }),
      video({ tags: ["city pop"], categoryId: "10" }),
    ]

    const groups = groupVideosByTagCluster(videos)

    expect(groups[0]?.videoCategoryId).toBe("10")
  })

  it("leaves a group untagged when there's no clear majority category", () => {
    const videos = [
      video({ tags: ["shared"], categoryId: "10" }), // Music
      video({ tags: ["shared"], categoryId: "24" }), // Entertainment (interview)
    ]

    const groups = groupVideosByTagCluster(videos)

    expect(groups[0]?.videoCategoryId).toBeUndefined()
  })

  it("leaves a group untagged when none of its videos have a category", () => {
    const videos = [
      video({ tags: ["shared"], categoryId: null }),
      video({ tags: ["shared"], categoryId: null }),
    ]

    const groups = groupVideosByTagCluster(videos)

    expect(groups[0]?.videoCategoryId).toBeUndefined()
  })
})

describe("normalizeTitleForDedup", () => {
  it("strips bracketed/parenthetical decoration", () => {
    expect(
      normalizeTitleForDedup(
        "Kingo Hamada [濱田金吾] - midnight cruisin' (FanMade Music Video)",
      ),
    ).toBe("kingo hamada midnight cruisin")
  })

  it("lowercases and collapses punctuation to single spaces", () => {
    expect(normalizeTitleForDedup("Rock & Roll!!")).toBe("rock roll")
  })

  it("preserves non-Latin scripts", () => {
    expect(normalizeTitleForDedup("街のドルフィン (Dolphin in Town)")).toBe(
      "街のドルフィン",
    )
  })
})

describe("isLikelyDuplicateTitle", () => {
  it("matches a re-upload with extra decoration around the same core title", () => {
    expect(
      isLikelyDuplicateTitle(
        "Midnight Cruisin'",
        "Kingo Hamada [濱田金吾] - midnight cruisin' (FanMade Music Video)",
      ),
    ).toBe(true)
    expect(
      isLikelyDuplicateTitle(
        "Midnight Cruisin'",
        "midnight cruisin' (1982) - Kingo Hamada 濱田金吾 【Lock Dance × 8bit】",
      ),
    ).toBe(true)
  })

  it("does not match unrelated titles", () => {
    expect(isLikelyDuplicateTitle("Fireside", "Arctic Monkeys - Body Paint")).toBe(
      false,
    )
  })

  it("does not false-positive on a short/generic normalized title", () => {
    expect(isLikelyDuplicateTitle("MV", "Some Random MV Compilation")).toBe(false)
  })

  it("still matches when both titles are identical after normalization", () => {
    expect(isLikelyDuplicateTitle("Ride On Time", "Ride on Time!")).toBe(true)
  })

  it("can't bridge different scripts for the same song (known limitation)", () => {
    expect(
      isLikelyDuplicateTitle("Machi No Dorufin", "街のドルフィン (Dolphin in Town)"),
    ).toBe(false)
  })

  it("matches a re-upload whose words are reordered, not just decorated", () => {
    expect(
      isLikelyDuplicateTitle(
        "Kingo Hamada - Midnight Cruisin'",
        "Midnight Cruisin' (1982) - Kingo Hamada 濱田金吾 【Lock Dance × 8bit】",
      ),
    ).toBe(true)
  })
})

describe("looksLikeNonMusicContent", () => {
  it("flags an awards-show clip", () => {
    expect(
      looksLikeNonMusicContent({
        title: "HARRY STYLES Wins Album Of The Year",
        channelTitle: "GRAMMYS",
      }),
    ).toBe(true)
  })

  it("flags an artist interview", () => {
    expect(
      looksLikeNonMusicContent({
        title: "Arctic Monkeys Interview in Amsterdam 2006",
        channelTitle: "humbggs",
      }),
    ).toBe(true)
  })

  it("flags a meme-style 'iconic' clip", () => {
    expect(
      looksLikeNonMusicContent({
        title: "jamie cook being iconic for one minute straight",
        channelTitle: "ghost cookie",
      }),
    ).toBe(true)
  })

  it("does not flag an actual song upload", () => {
    expect(
      looksLikeNonMusicContent({
        title: "Harry Styles - Late Night Talking (Official Video)",
        channelTitle: "HarryStylesVEVO",
      }),
    ).toBe(false)
  })

  it("checks the channel name too, not just the title", () => {
    expect(
      looksLikeNonMusicContent({
        title: "Album Of The Year",
        channelTitle: "GRAMMYS",
      }),
    ).toBe(true)
  })
})
