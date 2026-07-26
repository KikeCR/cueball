const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/

export function parseYoutubeVideoId(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const host = parsed.hostname.replace(/^www\./, "")

  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1)
    return VIDEO_ID_PATTERN.test(id) ? id : null
  }

  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com"
  ) {
    if (parsed.pathname === "/watch") {
      const id = parsed.searchParams.get("v")
      return id && VIDEO_ID_PATTERN.test(id) ? id : null
    }

    const shortsMatch = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/)
    if (shortsMatch?.[1]) return shortsMatch[1]

    const embedMatch = parsed.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/)
    if (embedMatch?.[1]) return embedMatch[1]
  }

  return null
}

interface OEmbedResponse {
  title: string
  thumbnail_url: string
}

export interface VideoMetadata {
  title: string
  thumbnailUrl: string
}

export async function fetchVideoMetadata(
  videoId: string,
): Promise<VideoMetadata | null> {
  const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`,
  )}&format=json`

  const res = await fetch(oEmbedUrl)
  if (!res.ok) return null

  const body = (await res.json()) as OEmbedResponse
  return { title: body.title, thumbnailUrl: body.thumbnail_url }
}

const ISO8601_DURATION_PATTERN = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/

/** Parses a YouTube contentDetails duration (e.g. "PT1H2M3S") into seconds. */
export function parseIso8601DurationSeconds(duration: string): number | null {
  const match = duration.match(ISO8601_DURATION_PATTERN)
  if (!match) return null

  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const seconds = Number(match[3] ?? 0)
  return hours * 3600 + minutes * 60 + seconds
}

export function isYoutubeDataApiConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY)
}

interface VideosListResponse {
  items: Array<{ contentDetails: { duration: string } }>
}

/**
 * Video length in seconds, via the YouTube Data API (not oEmbed, which
 * doesn't expose duration). Returns null if unconfigured or unavailable,
 * so callers can fail open rather than block adding videos entirely.
 */
export async function fetchVideoDurationSeconds(
  videoId: string,
): Promise<number | null> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return null

  const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(videoId)}&key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return null

  const body = (await res.json()) as VideosListResponse
  const duration = body.items[0]?.contentDetails.duration
  return duration ? parseIso8601DurationSeconds(duration) : null
}

/** Formats a duration in seconds as "m:ss", for use in user-facing messages. */
export function formatDurationClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

export interface YoutubeSearchResult {
  videoId: string
  title: string
  thumbnailUrl: string | null
  channelTitle: string
}

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
}

/**
 * search.list's snippet.title/channelTitle come back with HTML entities
 * escaped (e.g. `&quot;Ode to Viceroy&quot;`) — YouTube itself renders these
 * as HTML, but nothing else in this app's flow shows text that way, so
 * they're decoded once here rather than leaking `&quot;` into every client.
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const isHex = entity[1] === "x" || entity[1] === "X"
      const codePoint = parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10)
      return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint)
    }
    return NAMED_HTML_ENTITIES[entity] ?? match
  })
}

interface SearchListResponse {
  items: Array<{
    id: { videoId?: string }
    snippet: {
      title: string
      channelTitle: string
      thumbnails: { medium?: { url: string }; default?: { url: string } }
    }
  }>
}

/**
 * search.list costs 100 quota units per call — flat, regardless of
 * maxResults — vs. ~1 unit for the videos.list/playlistItems calls used
 * elsewhere in this file. With a default 10,000/day project quota, that's
 * only ~100 searches a day across the whole app. Callers must cache
 * identical queries (see redis/youtubeSearchCache.ts) rather than call this
 * on every keystroke.
 */
export async function searchYoutubeVideos(
  query: string,
): Promise<YoutubeSearchResult[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return []

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8&q=${encodeURIComponent(query)}&key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`YouTube search failed with status ${res.status}`)
  }

  const body = (await res.json()) as SearchListResponse
  return body.items
    .filter((item): item is typeof item & { id: { videoId: string } } =>
      Boolean(item.id.videoId),
    )
    .map((item) => ({
      videoId: item.id.videoId,
      title: decodeHtmlEntities(item.snippet.title),
      thumbnailUrl:
        item.snippet.thumbnails.medium?.url ??
        item.snippet.thumbnails.default?.url ??
        null,
      channelTitle: decodeHtmlEntities(item.snippet.channelTitle),
    }))
}
