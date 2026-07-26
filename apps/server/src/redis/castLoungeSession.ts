import type { LoungeSessionState } from "../services/youtubeLounge.js"
import { redis } from "./client.js"

function loungeKey(roomId: string): string {
  return `room:${roomId}:lounge`
}

// Same reasoning as castSession.ts: this is only ever held by one live Cast
// connection, so a TTL is a safety net against an abandoned session lingering
// forever rather than the source of truth for its lifetime.
const LOUNGE_SESSION_TTL_SECONDS = 60 * 60 * 6

export async function getLoungeSessionState(
  roomId: string,
): Promise<LoungeSessionState | null> {
  const raw = await redis.get(loungeKey(roomId))
  return raw ? (JSON.parse(raw) as LoungeSessionState) : null
}

export async function setLoungeSessionState(
  roomId: string,
  state: LoungeSessionState,
): Promise<void> {
  await redis.set(
    loungeKey(roomId),
    JSON.stringify(state),
    "EX",
    LOUNGE_SESSION_TTL_SECONDS,
  )
}

export async function clearLoungeSessionState(roomId: string): Promise<void> {
  await redis.del(loungeKey(roomId))
}
