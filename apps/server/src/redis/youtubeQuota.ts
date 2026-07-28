import { redis } from "./client.js"

const DEFAULT_DAILY_QUOTA_UNITS = 10000

function dailyQuotaUnits(): number {
  const configured = Number(process.env.YOUTUBE_DAILY_QUOTA_UNITS)
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_DAILY_QUOTA_UNITS
}

// Once usage crosses this fraction of the daily quota, the optional
// related-videos feature stops offering itself — search (the feature people
// actually rely on to add videos) matters more than a "you might also like"
// section, so this leaves real headroom for search to keep working for the
// rest of the day rather than letting a beta feature use up the last of it.
const RELATED_VIDEOS_QUOTA_THRESHOLD = 0.7

// YouTube's Data API quota resets at midnight Pacific Time specifically, not
// UTC or server-local time — bucketing the counter key by the current
// Pacific calendar date keeps this in sync with Google's own reset instead
// of drifting against it.
function pacificDateKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${lookup.year}-${lookup.month}-${lookup.day}`
}

function quotaKey(): string {
  return `youtube-quota:${pacificDateKey()}`
}

// The key is already bucketed by Pacific date, so this TTL isn't what makes
// a day's usage reset — it's just a safety net against an abandoned key
// lingering in Redis forever, generous enough to never expire a still-active
// day's bucket even across clock skew.
const QUOTA_KEY_TTL_SECONDS = 60 * 60 * 30

/** Call after every real YouTube Data API request, success or failure — Google bills the unit cost regardless of the response content. */
export async function recordYoutubeQuotaUsage(units: number): Promise<void> {
  const key = quotaKey()
  await redis.incrby(key, units)
  await redis.expire(key, QUOTA_KEY_TTL_SECONDS)
}

export async function getYoutubeQuotaUsage(): Promise<number> {
  const raw = await redis.get(quotaKey())
  return raw ? Number(raw) : 0
}

/** False once today's usage crosses the safety threshold — the caller should hide/refuse the related-videos feature rather than risk starving search of the day's remaining quota. */
export async function isRelatedVideosQuotaHealthy(): Promise<boolean> {
  const used = await getYoutubeQuotaUsage()
  return used / dailyQuotaUnits() < RELATED_VIDEOS_QUOTA_THRESHOLD
}
