import type { YoutubeSearchResult } from "../services/youtube.js"
import { redis } from "./client.js"

function relatedVideosKey(roomId: string): string {
  return `room:${roomId}:related-videos`
}

// Safety net against a stale list lingering in Redis forever for a room
// that's gone quiet — not the source of truth for freshness. The list only
// ever changes when someone explicitly clicks refresh (see sockets/queue.ts).
const RELATED_VIDEOS_TTL_SECONDS = 60 * 60 * 6

export async function getRelatedVideosState(
  roomId: string,
): Promise<YoutubeSearchResult[] | null> {
  const raw = await redis.get(relatedVideosKey(roomId))
  return raw ? (JSON.parse(raw) as YoutubeSearchResult[]) : null
}

export async function setRelatedVideosState(
  roomId: string,
  results: YoutubeSearchResult[],
): Promise<void> {
  await redis.set(
    relatedVideosKey(roomId),
    JSON.stringify(results),
    "EX",
    RELATED_VIDEOS_TTL_SECONDS,
  )
}
