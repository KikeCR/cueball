import { recordYoutubeQuotaUsage } from "../redis/youtubeQuota.js"

const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/

const QUOTA_COST_VIDEOS_LIST = 1
const QUOTA_COST_SEARCH_LIST = 100

export class YoutubeQuotaExceededError extends Error {
  constructor() {
    super(
      "YouTube's daily API limit has been reached. This resets automatically — try again later.",
    )
    this.name = "YoutubeQuotaExceededError"
  }
}

/** Best-effort: a body that isn't JSON, or doesn't have the expected shape, just means "unknown reason" rather than a hard failure. */
async function getYoutubeErrorReason(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as {
      error?: { errors?: Array<{ reason?: string }> }
    }
    return body.error?.errors?.[0]?.reason ?? null
  } catch {
    return null
  }
}

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
  await recordYoutubeQuotaUsage(QUOTA_COST_VIDEOS_LIST)
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
  options?: { videoCategoryId?: string },
): Promise<YoutubeSearchResult[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return []

  const categoryParam = options?.videoCategoryId
    ? `&videoCategoryId=${encodeURIComponent(options.videoCategoryId)}`
    : ""
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=8&q=${encodeURIComponent(query)}${categoryParam}&key=${apiKey}`
  const res = await fetch(url)
  await recordYoutubeQuotaUsage(QUOTA_COST_SEARCH_LIST)
  if (!res.ok) {
    const reason = await getYoutubeErrorReason(res)
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
      throw new YoutubeQuotaExceededError()
    }
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

export interface VideoTagInfo {
  videoId: string
  title: string
  tags: string[]
  /** YouTube's own category (e.g. "10" = Music) — same response, no extra quota cost to read it. */
  categoryId: string | null
}

interface VideosListSnippetResponse {
  items: Array<{
    id: string
    snippet: { title: string; tags?: string[]; categoryId?: string }
  }>
}

/**
 * videos.list costs a flat 1 quota unit per call regardless of how many ids
 * are requested (up to its own 50-id cap) — unlike search.list, so this
 * batches every id into one call instead of one call per video.
 */
export async function fetchVideoTagInfo(
  videoIds: string[],
): Promise<VideoTagInfo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey || videoIds.length === 0) return []

  const ids = videoIds.slice(0, 50)
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(ids.join(","))}&key=${apiKey}`
  const res = await fetch(url)
  await recordYoutubeQuotaUsage(QUOTA_COST_VIDEOS_LIST)
  if (!res.ok) return []

  const body = (await res.json()) as VideosListSnippetResponse
  return body.items.map((item) => ({
    videoId: item.id,
    title: item.snippet.title,
    tags: item.snippet.tags ?? [],
    categoryId: item.snippet.categoryId ?? null,
  }))
}

const RELATED_QUERY_STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "and", "in", "on", "for", "is",
  "with", "official", "video", "music", "ft", "feat", "lyrics",
  "audio", "hd", "4k",
])

/**
 * Builds a single search query representing a set of videos, rather than any
 * one of them individually — used both for a whole cluster of related videos
 * (see groupVideosByTagCluster) and, as a fallback, for videos that don't
 * cluster with anything else. Pure and easy to test without mocking network
 * calls.
 *
 * Prefers each video's own uploader-set tags (most videos that have any tend
 * to share several across a genre/artist), aggregated by frequency across
 * every video passed in. Many uploads have no tags at all though, so if
 * fewer than 2 distinct tags turn up across the whole set, this falls back
 * to frequent, non-generic words pulled from the titles instead.
 */
export function buildRelatedVideosQuery(videos: VideoTagInfo[]): string {
  const tagCounts = new Map<string, number>()
  for (const video of videos) {
    for (const rawTag of video.tags) {
      const tag = rawTag.trim().toLowerCase()
      if (!tag) continue
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag)

  if (topTags.length >= 2) return topTags.join(" ")

  const wordCounts = new Map<string, number>()
  for (const video of videos) {
    for (const rawWord of video.title.split(/[^a-zA-Z0-9]+/)) {
      const word = rawWord.trim().toLowerCase()
      if (word.length < 3 || RELATED_QUERY_STOPWORDS.has(word)) continue
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1)
    }
  }
  const topWords = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word]) => word)

  return [...topTags, ...topWords].join(" ")
}

/** Each entry is a search.list-ready query representing one tag-cluster (or the catch-all remainder) — see groupVideosByTagCluster. */
export interface RelatedVideoQueryGroup {
  query: string
  /** Whichever category most of the group's videos share, if any — passed to search.list so e.g. a music room's suggestions stay music (not interviews, reaction clips, etc. about the same artist). */
  videoCategoryId?: string
}

const MAX_RELATED_QUERY_GROUPS = 3

/** Undefined (not filtered) unless a clear majority of the group actually shares one category. */
function majorityCategoryId(videos: VideoTagInfo[]): string | undefined {
  const counts = new Map<string, number>()
  for (const video of videos) {
    if (!video.categoryId) continue
    counts.set(video.categoryId, (counts.get(video.categoryId) ?? 0) + 1)
  }

  let bestId: string | undefined
  let bestCount = 0
  for (const [id, count] of counts) {
    if (count > bestCount) {
      bestId = id
      bestCount = count
    }
  }
  return bestCount > videos.length / 2 ? bestId : undefined
}

/**
 * A room's queue is often a mix of genres/artists, not one coherent taste —
 * blending every video's tags into a single query (the old behavior)
 * regularly washed out into something incoherent that matched nothing (e.g.
 * a queue mixing city pop and indie rock). This groups videos that actually
 * share a tag with each other first, and builds one query per group, so a
 * mixed queue gets back a query targeted at each of its distinct clusters
 * instead of one query targeted at none of them.
 *
 * Greedy, not a proper clustering algorithm: repeatedly finds whichever tag
 * currently covers the most still-ungrouped videos, claims every video that
 * has it, and repeats — capped at MAX_RELATED_QUERY_GROUPS groups (each one
 * costs a separate 100-unit search.list call, so this bounds quota spend per
 * refresh click). Only tags shared by at least 2 videos count, since a tag
 * only one video has doesn't define a group. Whatever's left ungrouped after
 * that (including everything, if nothing shared any tag at all) becomes one
 * final catch-all group, using the same tag/title fallback
 * buildRelatedVideosQuery already does for a single video.
 */
export function groupVideosByTagCluster(
  videos: VideoTagInfo[],
): RelatedVideoQueryGroup[] {
  const remaining = new Map(videos.map((video) => [video.videoId, video]))
  const groups: RelatedVideoQueryGroup[] = []

  while (groups.length < MAX_RELATED_QUERY_GROUPS && remaining.size > 0) {
    const pool = [...remaining.values()]

    const tagVideoIds = new Map<string, Set<string>>()
    for (const video of pool) {
      for (const rawTag of video.tags) {
        const tag = rawTag.trim().toLowerCase()
        if (!tag) continue
        const ids = tagVideoIds.get(tag) ?? new Set<string>()
        ids.add(video.videoId)
        tagVideoIds.set(tag, ids)
      }
    }

    let bestTag: string | null = null
    let bestIds: Set<string> | null = null
    for (const [tag, ids] of tagVideoIds) {
      if (ids.size < 2) continue
      if (!bestIds || ids.size > bestIds.size) {
        bestTag = tag
        bestIds = ids
      }
    }
    if (!bestTag || !bestIds) break

    const clusterVideos = pool.filter((video) => bestIds!.has(video.videoId))
    for (const video of clusterVideos) remaining.delete(video.videoId)

    const query = buildRelatedVideosQuery(clusterVideos)
    if (query) {
      groups.push({ query, videoCategoryId: majorityCategoryId(clusterVideos) })
    }
  }

  if (groups.length < MAX_RELATED_QUERY_GROUPS && remaining.size > 0) {
    const leftover = [...remaining.values()]
    const query = buildRelatedVideosQuery(leftover)
    if (query) {
      groups.push({ query, videoCategoryId: majorityCategoryId(leftover) })
    }
  }

  return groups
}

/** Strips uploader decoration (brackets, punctuation, casing) down to a comparable "core" title. */
export function normalizeTitleForDedup(title: string): string {
  return title
    .toLowerCase()
    .replace(/[[(【].*?[\])】]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
}

// Below this length, containment is too easy to satisfy by coincidence (a
// short generic word matching part of an unrelated title) to trust as a
// real match — only an exact match counts at that point.
const MIN_TITLE_LENGTH_FOR_CONTAINMENT_MATCH = 4

/**
 * True if two video titles most likely name the same underlying song/video
 * — e.g. a different channel's re-upload with extra decoration in the title
 * ("(FanMade Music Video)", "[Lyrics]", "(1982)", etc). Deliberately loose
 * (substring containment after stripping bracketed noise and punctuation)
 * rather than exact-match, since a re-upload keeps the core title as a
 * literal substring far more often than it reproduces the original title
 * verbatim.
 *
 * Can't bridge a title written in a different script/language for the same
 * song (e.g. a romanized title vs. the same song's original-script title,
 * or a translated one) — that needs real metadata, not text comparison, so
 * those duplicates will still slip through.
 */
export function isLikelyDuplicateTitle(a: string, b: string): boolean {
  const normalizedA = normalizeTitleForDedup(a)
  const normalizedB = normalizeTitleForDedup(b)
  if (!normalizedA || !normalizedB) return false
  if (normalizedA === normalizedB) return true
  if (
    normalizedA.length < MIN_TITLE_LENGTH_FOR_CONTAINMENT_MATCH ||
    normalizedB.length < MIN_TITLE_LENGTH_FOR_CONTAINMENT_MATCH
  ) {
    return false
  }
  return normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)
}
