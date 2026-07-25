import type { CastSessionState } from "@cueball/shared"
import { redis } from "./client.js"

function castKey(roomId: string): string {
  return `room:${roomId}:cast`
}

// The host's browser is the only client that ever holds a live Cast
// session; if their socket drops without cleanly ending the session, the
// stored state would otherwise linger forever, so cast state carries a
// TTL as a safety net (unlike presence, which self-heals via connect
// counts). Any write while the session is still active refreshes it.
const CAST_STATE_TTL_SECONDS = 60 * 60 * 6

export async function getCastState(
  roomId: string,
): Promise<CastSessionState | null> {
  const raw = await redis.get(castKey(roomId))
  return raw ? (JSON.parse(raw) as CastSessionState) : null
}

export async function setCastState(
  roomId: string,
  state: CastSessionState,
): Promise<void> {
  await redis.set(castKey(roomId), JSON.stringify(state), "EX", CAST_STATE_TTL_SECONDS)
}

export async function clearCastState(roomId: string): Promise<void> {
  await redis.del(castKey(roomId))
}
