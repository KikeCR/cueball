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
