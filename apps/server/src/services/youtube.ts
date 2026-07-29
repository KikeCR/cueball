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

interface VideosListDurationsResponse {
  items: Array<{ id: string; contentDetails: { duration: string } }>
}

/**
 * Batched (not per-video) duration lookup — same 1-quota-unit-per-call
 * saving as fetchVideoTagInfo, and the same fail-open contract as
 * fetchVideoDurationSeconds: a video missing from the result (unconfigured,
 * request failed, or an unparseable duration) just isn't in the returned
 * map, rather than blocking the caller.
 */
export async function fetchVideoDurationsSeconds(
  videoIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey || videoIds.length === 0) return result

  const ids = videoIds.slice(0, 50)
  const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(ids.join(","))}&key=${apiKey}`
  const res = await fetch(url)
  await recordYoutubeQuotaUsage(QUOTA_COST_VIDEOS_LIST)
  if (!res.ok) return result

  const body = (await res.json()) as VideosListDurationsResponse
  for (const item of body.items) {
    const seconds = parseIso8601DurationSeconds(item.contentDetails.duration)
    if (seconds !== null) result.set(item.id, seconds)
  }
  return result
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

// YouTube search supports minus-prefixed terms to exclude matches, the same
// syntax as a plain google.com search. videoCategoryId=10 (Music) alone
// isn't a reliable enough signal against this stuff — an awards-show clip
// or an artist interview is routinely categorized as Music too, since the
// category is topical ("this is about music") rather than "this is a song".
const CONTENT_TYPE_EXCLUSION_TERMS = [
  "interview",
  "reaction",
  "reacts",
  "grammys",
  "award",
  "awards",
  "documentary",
  "podcast",
  "compilation",
]

function withContentTypeExclusions(query: string): string {
  const exclusions = CONTENT_TYPE_EXCLUSION_TERMS.map((term) => `-${term}`).join(" ")
  return `${query} ${exclusions}`
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
 * Not a proper clustering algorithm: each of up to MAX_RELATED_QUERY_GROUPS
 * groups is formed by picking a tag at random from whichever still cover at
 * least 2 ungrouped videos (a tag only one video has doesn't define a
 * group), and claiming every video that has it. Random, not "biggest
 * cluster wins", on purpose — with more than a handful of distinct
 * tags/artists in the queue, always picking by size means every refresh
 * just re-surfaces the same one or two most-represented clusters and never
 * anything else; random selection means a later refresh can turn up a
 * smaller part of the room's taste instead of the same loudest one every
 * time. Whatever's left ungrouped once nothing else shares a tag (including
 * everything, if nothing ever did) becomes one final catch-all group, using
 * the same tag/title fallback buildRelatedVideosQuery already does for a
 * single video.
 *
 * `random` is injectable (defaults to Math.random) so callers — tests,
 * mainly — can supply a deterministic source instead.
 */
export function groupVideosByTagCluster(
  videos: VideoTagInfo[],
  random: () => number = Math.random,
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

    const eligible = [...tagVideoIds.values()].filter((ids) => ids.size >= 2)
    if (eligible.length === 0) break
    const chosenIds = eligible[Math.floor(random() * eligible.length)]!

    const clusterVideos = pool.filter((video) => chosenIds.has(video.videoId))
    for (const video of clusterVideos) remaining.delete(video.videoId)

    const query = buildRelatedVideosQuery(clusterVideos)
    if (query) {
      groups.push({
        query: withContentTypeExclusions(query),
        videoCategoryId: majorityCategoryId(clusterVideos),
      })
    }
  }

  if (groups.length < MAX_RELATED_QUERY_GROUPS && remaining.size > 0) {
    const leftover = [...remaining.values()]
    const query = buildRelatedVideosQuery(leftover)
    if (query) {
      groups.push({
        query: withContentTypeExclusions(query),
        videoCategoryId: majorityCategoryId(leftover),
      })
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

// Below this length, a word is too easy to match by coincidence (a short
// generic word matching part of an unrelated title) to trust as a real
// signal, so it's dropped before comparing.
const MIN_WORD_LENGTH_FOR_DEDUP_MATCH = 4

// Once this much of the shorter title's words show up in the longer one,
// it's overwhelmingly likely to be the same underlying song rather than a
// coincidence — not 100%, since a re-upload can drop or reorder a word
// ("Kingo Hamada - Midnight Cruisin'" vs "Midnight Cruisin' (1982) - Kingo
// Hamada 濱田金吾 【Lock Dance】").
const DUPLICATE_TITLE_WORD_OVERLAP_THRESHOLD = 0.8

/**
 * True if two video titles most likely name the same underlying song/video
 * — e.g. a different channel's re-upload with extra decoration in the title
 * ("(FanMade Music Video)", "[Lyrics]", "(1982)", etc), possibly with its
 * words in a different order too. Compares by word overlap (after stripping
 * bracketed noise and punctuation) rather than requiring one title to be a
 * literal substring of the other, since a re-upload just as often reorders
 * words as it does append them.
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

  const wordsA = normalizedA
    .split(" ")
    .filter((word) => word.length >= MIN_WORD_LENGTH_FOR_DEDUP_MATCH)
  const wordsB = normalizedB
    .split(" ")
    .filter((word) => word.length >= MIN_WORD_LENGTH_FOR_DEDUP_MATCH)
  if (wordsA.length === 0 || wordsB.length === 0) return false

  const [shorter, longer] =
    wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA]
  const longerWords = new Set(longer)
  const overlap = shorter.filter((word) => longerWords.has(word)).length
  return overlap / shorter.length >= DUPLICATE_TITLE_WORD_OVERLAP_THRESHOLD
}

// Substring markers (checked against both title and channel name) for
// content that routinely turns up for a real artist/song query without
// being an actual song upload — interviews, awards-show clips, meme/reaction
// content. This is a blunter, title-text-only backstop for whatever the
// search-query exclusions (see withContentTypeExclusions) and category
// filter (see majorityCategoryId) don't catch — YouTube's own category is a
// topical label ("this is about music"), not "this is literally a song", so
// an artist interview or awards clip is routinely categorized as Music too.
const NON_MUSIC_CONTENT_MARKERS = [
  "interview",
  "reaction",
  "reacts",
  "grammys",
  "grammy",
  "award",
  "documentary",
  "podcast",
  "compilation",
  "behind the scenes",
  "funny moments",
  "iconic",
]

export function looksLikeNonMusicContent(result: {
  title: string
  channelTitle: string
}): boolean {
  const haystack = `${result.title} ${result.channelTitle}`.toLowerCase()
  return NON_MUSIC_CONTENT_MARKERS.some((marker) => haystack.includes(marker))
}
