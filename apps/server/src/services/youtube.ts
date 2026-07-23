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
