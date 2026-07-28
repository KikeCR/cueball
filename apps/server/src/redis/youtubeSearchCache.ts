import type { YoutubeSearchResult } from "../services/youtube.js"
import { redis } from "./client.js"

// search.list costs 100 quota units per call (vs. ~1 for most other calls
// this app makes), so identical queries — very likely across a handful of
// people in the same room typing similar terms — are cached instead of
// re-spent. An hour is plenty for search results to stay relevant.
const SEARCH_CACHE_TTL_SECONDS = 60 * 60

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}

// A category-filtered search for the same query text is a genuinely
// different request to YouTube (and returns different results) from an
// unfiltered one, so it needs its own cache entry — folded into the key only
// when present, so plain-text search's (unfiltered) cache keys are unchanged.
function searchCacheKey(query: string, videoCategoryId?: string): string {
  const suffix = videoCategoryId ? `:cat${videoCategoryId}` : ""
  return `youtube-search:${normalizeQuery(query)}${suffix}`
}

export async function getCachedSearchResults(
  query: string,
  videoCategoryId?: string,
): Promise<YoutubeSearchResult[] | null> {
  const raw = await redis.get(searchCacheKey(query, videoCategoryId))
  return raw ? (JSON.parse(raw) as YoutubeSearchResult[]) : null
}

export async function setCachedSearchResults(
  query: string,
  results: YoutubeSearchResult[],
  videoCategoryId?: string,
): Promise<void> {
  await redis.set(
    searchCacheKey(query, videoCategoryId),
    JSON.stringify(results),
    "EX",
    SEARCH_CACHE_TTL_SECONDS,
  )
}
