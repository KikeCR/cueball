import { getIo } from "../realtime.js"

/**
 * Derived directly from socket.io's own live connection state (same
 * `fetchSockets()` the ParticipantRemove handler already uses), rather than
 * hand-rolled bookkeeping in Redis — a manually-maintained counter has no
 * way to self-correct if the server process restarts mid-connection (every
 * `markDisconnected` call it was waiting for is simply never coming), which
 * left rooms permanently stuck showing "someone's connected" after any dev
 * restart. Live socket state can't leak this way: a fresh process starts
 * with zero sockets, period.
 */
export async function getConnectedParticipantIds(
  roomId: string,
): Promise<Set<string>> {
  const io = getIo()
  if (!io) return new Set()

  const sockets = await io.in(roomId).fetchSockets()
  const ids = new Set<string>()
  for (const socket of sockets) {
    const participantId = socket.data.participantId as string | undefined
    if (participantId) ids.add(participantId)
  }
  return ids
}
