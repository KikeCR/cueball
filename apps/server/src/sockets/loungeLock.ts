const locks = new Map<string, Promise<unknown>>()

/**
 * Every Cast-mode code path that touches the live Lounge session (rebind,
 * send a command, persist the updated session back to Redis) does a
 * read-modify-write against the same per-room state, and several of them
 * can fire independently around the same moment for the same room — a
 * vote's debounced queue resync, a fresh add's immediate push, the poller
 * reconciling a video that just finished. If two interleave, their Lounge
 * API calls can clobber each other's session progress (a stale
 * rid/commandOffset overwriting a newer one) or leave the receiver's live
 * queue in whichever order the last write happened to land in rather than
 * the one either caller intended — a very plausible explanation for
 * something like "the second video I voted for played before the first."
 *
 * This serializes every such block per room, so only one is ever touching
 * a given room's Lounge session at a time; one room's queue backing up
 * behind a slow call (e.g. a multi-video repeat restart) never blocks any
 * other room's.
 */
export function withLoungeLock<T>(
  roomId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = locks.get(roomId) ?? Promise.resolve()
  const run = previous.then(fn, fn)
  locks.set(
    roomId,
    run.then(
      () => undefined,
      () => undefined,
    ),
  )
  return run
}
