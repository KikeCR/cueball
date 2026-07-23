import { redis } from "./client.js"

function presenceKey(roomId: string): string {
  return `room:${roomId}:presence`
}

/** Tracks connection count per participant so multiple tabs/reconnects don't drop presence early. */
export async function markConnected(
  roomId: string,
  participantId: string,
): Promise<void> {
  await redis.hincrby(presenceKey(roomId), participantId, 1)
}

export async function markDisconnected(
  roomId: string,
  participantId: string,
): Promise<void> {
  const key = presenceKey(roomId)
  const remaining = await redis.hincrby(key, participantId, -1)
  if (remaining <= 0) {
    await redis.hdel(key, participantId)
  }
}

export async function getConnectedParticipantIds(
  roomId: string,
): Promise<Set<string>> {
  const counts = await redis.hgetall(presenceKey(roomId))
  return new Set(Object.keys(counts).filter((id) => Number(counts[id]) > 0))
}
