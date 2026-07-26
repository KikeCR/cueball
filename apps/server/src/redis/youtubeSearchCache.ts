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

function searchCacheKey(query: string): string {
  return `youtube-search:${normalizeQuery(query)}`
}

export async function getCachedSearchResults(
  query: string,
): Promise<YoutubeSearchResult[] | null> {
  const raw = await redis.get(searchCacheKey(query))
  return raw ? (JSON.parse(raw) as YoutubeSearchResult[]) : null
}

export async function setCachedSearchResults(
  query: string,
  results: YoutubeSearchResult[],
): Promise<void> {
  await redis.set(
    searchCacheKey(query),
    JSON.stringify(results),
    "EX",
    SEARCH_CACHE_TTL_SECONDS,
  )
}
