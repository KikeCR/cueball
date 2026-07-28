/**
 * Everything in this file talks to YouTube's unofficial, undocumented
 * "Lounge API" — the private protocol the real YouTube mobile/TV apps use
 * to remote-control a TV's YouTube app once it's running, which is exactly
 * what connecting to CueBall's Cast receiver app id launches. The standard
 * Cast Sender SDK's media LOAD calls do nothing against this receiver; it
 * only responds to this separate protocol.
 *
 * Reverse-engineered from a known-working open source reference
 * (github.com/ur1katz/casttube) — not a Google contract. No guarantee this
 * keeps working if Google changes anything on their end. The setPlaylist/
 * addVideo/bind mechanics below mirror that reference closely (high
 * confidence); the transport commands (play/pause/next/previous/seekTo) are
 * not demonstrated there and are inferred from community write-ups of the
 * same protocol — least-verified part of this file.
 */

const YOUTUBE_BASE_URL = "https://www.youtube.com/"
const LOUNGE_TOKEN_URL = `${YOUTUBE_BASE_URL}api/lounge/pairing/get_lounge_token_batch`
const SCREEN_PAIRING_URL = `${YOUTUBE_BASE_URL}api/lounge/pairing/get_screen`
const BIND_URL = `${YOUTUBE_BASE_URL}api/lounge/bc/bind`
const LOUNGE_ID_HEADER = "X-YouTube-LoungeId-Token"

const BASE_HEADERS = {
  Origin: YOUTUBE_BASE_URL,
  "Content-Type": "application/x-www-form-urlencoded",
}

// Must stay constant across every bind for the same logical "remote" so
// YouTube's backend recognizes a rebind as the same sender reconnecting
// (preserving the live session) rather than a brand new one.
const SENDER_DEVICE_ID = "cueballcueballcueballcueba"
const SENDER_DEVICE_TYPE = "REMOTE_CONTROL"
const SENDER_NAME = "CueBall"

const BIND_DATA: Record<string, string | number> = {
  device: SENDER_DEVICE_TYPE,
  id: SENDER_DEVICE_ID,
  name: SENDER_NAME,
  "mdx-version": 3,
  pairing_type: "cast",
  app: "android-phone-13.14.55",
}

export interface LoungeSessionState {
  screenId: string
  loungeToken: string
  sid: string
  gsessionid: string
  rid: number
  reqCount: number
  /** Increments once per command sent, independent of rid/reqCount (which reset on every rebind) — mirrors the "ofs" field a persistently-connected Lounge client tracks across its whole session. */
  commandOffset: number
}

function encodeForm(fields: Record<string, string | number>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(fields)) {
    params.set(key, String(value))
  }
  return params.toString()
}

export async function getLoungeToken(screenId: string): Promise<string> {
  const res = await fetch(LOUNGE_TOKEN_URL, {
    method: "POST",
    headers: BASE_HEADERS,
    body: encodeForm({ screen_ids: screenId }),
  })
  if (!res.ok) {
    throw new Error(`Failed to get a YouTube lounge token (status ${res.status})`)
  }
  const body = (await res.json()) as {
    screens?: Array<{ loungeToken?: string }>
  }
  const loungeToken = body.screens?.[0]?.loungeToken
  if (!loungeToken) {
    throw new Error("YouTube didn't return a lounge token for this screen")
  }
  return loungeToken
}

export interface PairedScreen {
  screenId: string
  loungeToken: string
  name: string | null
}

/**
 * The alternative to the Cast MDX handshake (see useCastSender.ts) for
 * devices with no Cast support at all — Roku, most smart TVs, game
 * consoles. Any screen showing the YouTube app can display a manual
 * pairing code (Settings > "Link with TV code"); exchanging it here
 * returns the same screenId/loungeToken pair the Cast flow gets by other
 * means. Everything downstream (bind, setPlaylist, addVideo, transport
 * commands, status polling) is identical regardless of which method
 * produced them — the Lounge API doesn't know or care how the sender found
 * the screen.
 */
export async function pairWithScreenCode(
  pairingCode: string,
): Promise<PairedScreen> {
  const res = await fetch(SCREEN_PAIRING_URL, {
    method: "POST",
    headers: BASE_HEADERS,
    body: encodeForm({ pairing_code: pairingCode }),
  })
  if (!res.ok) {
    throw new Error(`Failed to pair with that code (status ${res.status})`)
  }
  const body = (await res.json()) as {
    screen?: { screenId?: string; loungeToken?: string; name?: string }
  }
  const screenId = body.screen?.screenId
  const loungeToken = body.screen?.loungeToken
  if (!screenId || !loungeToken) {
    throw new Error("That code doesn't seem to be valid")
  }
  return { screenId, loungeToken, name: body.screen?.name ?? null }
}

const SID_PATTERN = /"c","(.*?)","/
const GSESSIONID_PATTERN = /"S","(.*?)"]/

/**
 * Binds a fresh session against an existing lounge token. Real Lounge
 * sessions drift out of sync after roughly 30 seconds of being held open,
 * so every command in this file rebinds immediately before sending —
 * that's the fix the reference implementation found for that, not an
 * oversight here.
 */
export async function bindLoungeSession(
  screenId: string,
  loungeToken: string,
): Promise<LoungeSessionState> {
  const res = await fetch(`${BIND_URL}?${encodeForm({ RID: 0, VER: 8, CVER: 1 })}`, {
    method: "POST",
    headers: { ...BASE_HEADERS, [LOUNGE_ID_HEADER]: loungeToken },
    body: encodeForm(BIND_DATA),
  })
  if (!res.ok) {
    throw new Error(`Failed to bind a YouTube lounge session (status ${res.status})`)
  }
  const text = await res.text()
  const sid = SID_PATTERN.exec(text)?.[1]
  const gsessionid = GSESSIONID_PATTERN.exec(text)?.[1]
  if (!sid || !gsessionid) {
    throw new Error("Couldn't parse a YouTube lounge session from the bind response")
  }
  return {
    screenId,
    loungeToken,
    sid,
    gsessionid,
    rid: 1,
    reqCount: 0,
    commandOffset: 0,
  }
}

/** First-time setup for a newly connected Cast session: token, then bind. */
export async function startLoungeSession(
  screenId: string,
): Promise<LoungeSessionState> {
  const loungeToken = await getLoungeToken(screenId)
  return bindLoungeSession(screenId, loungeToken)
}

/** Re-binds using the same lounge token, carrying the running command offset forward (rebinding itself resets rid/reqCount, but commandOffset tracks the whole session's command history, not just one bind). */
export async function rebindLoungeSession(
  session: LoungeSessionState,
): Promise<LoungeSessionState> {
  const bound = await bindLoungeSession(session.screenId, session.loungeToken)
  return { ...bound, commandOffset: session.commandOffset }
}

/**
 * Sends one command against an already-bound session. Every command needs
 * `count`/`ofs` fields regardless of type — a gap in the original version
 * of this file (present for queue mutations, silently missing for
 * play/pause/next/seekTo) that likely explains those never working despite
 * setPlaylist/addVideo succeeding. Field/query shape now matches a fuller
 * reference implementation (github.com/bertybuttface/youtube-lounge-rs)
 * rather than the more minimal one the rest of this file is based on.
 */
async function sendLoungeAction(
  session: LoungeSessionState,
  fields: Record<string, string | number>,
): Promise<LoungeSessionState> {
  const prefixed: Record<string, string | number> = {
    count: 1,
    ofs: session.commandOffset,
  }
  for (const [key, value] of Object.entries(fields)) {
    prefixed[key.startsWith("_") ? `req${session.reqCount}${key}` : key] = value
  }

  const query = encodeForm({
    SID: session.sid,
    gsessionid: session.gsessionid,
    RID: session.rid,
    VER: 8,
    v: 2,
    TYPE: "bind",
    t: 1,
    AID: 0,
    CI: 0,
    name: SENDER_NAME,
    id: SENDER_DEVICE_ID,
    device: SENDER_DEVICE_TYPE,
    loungeIdToken: session.loungeToken,
  })
  const res = await fetch(`${BIND_URL}?${query}`, {
    method: "POST",
    headers: { ...BASE_HEADERS, [LOUNGE_ID_HEADER]: session.loungeToken },
    body: encodeForm(prefixed),
  })
  if (!res.ok) {
    throw new Error(`YouTube lounge command failed (status ${res.status})`)
  }
  return {
    ...session,
    rid: session.rid + 1,
    reqCount: session.reqCount + 1,
    commandOffset: session.commandOffset + 1,
  }
}

/** Loads a video immediately, replacing whatever the receiver was doing. */
export async function setLoungePlaylist(
  session: LoungeSessionState,
  videoId: string,
): Promise<LoungeSessionState> {
  const bound = await rebindLoungeSession(session)
  return sendLoungeAction(bound, {
    _listId: "",
    __sc: "setPlaylist",
    _currentTime: 0,
    _currentIndex: -1,
    _audioOnly: "false",
    _videoId: videoId,
  })
}

/** Appends to the end of the receiver's own live queue — it auto-advances into these itself once the current video ends. */
export async function addVideoToLoungeQueue(
  session: LoungeSessionState,
  videoId: string,
): Promise<LoungeSessionState> {
  const bound = await rebindLoungeSession(session)
  return sendLoungeAction(bound, { __sc: "addVideo", _videoId: videoId })
}

/** Removes one video from the receiver's own live queue, without touching whatever's currently playing. */
export async function removeVideoFromLoungeQueue(
  session: LoungeSessionState,
  videoId: string,
): Promise<LoungeSessionState> {
  const bound = await rebindLoungeSession(session)
  return sendLoungeAction(bound, { __sc: "removeVideo", _videoId: videoId })
}

export async function clearLoungePlaylist(
  session: LoungeSessionState,
): Promise<LoungeSessionState> {
  const bound = await rebindLoungeSession(session)
  return sendLoungeAction(bound, { __sc: "clearPlaylist", _videoId: "" })
}

export type LoungeTransportAction = "play" | "pause" | "next" | "previous"

export async function sendLoungeTransportCommand(
  session: LoungeSessionState,
  action: LoungeTransportAction,
): Promise<LoungeSessionState> {
  const bound = await rebindLoungeSession(session)
  return sendLoungeAction(bound, { __sc: action })
}

export async function seekLoungeTo(
  session: LoungeSessionState,
  seconds: number,
): Promise<LoungeSessionState> {
  const bound = await rebindLoungeSession(session)
  return sendLoungeAction(bound, { __sc: "seekTo", _newTime: seconds })
}

export interface LoungeNowPlaying {
  /**
   * Null covers two distinct things the receiver reports the same way: the
   * `videoId` field arriving empty. When the receiver runs out of its own
   * queued videos to auto-advance into (nothing left to play), it emits a
   * `nowPlaying` event with `state: "-1"` and no `videoId` at all, rather
   * than just going quiet — that's the only signal this integration gets
   * for "playback stopped with nothing next," so a caller needs to be able
   * to tell "an event arrived saying nothing is playing" (this field null)
   * apart from "no event arrived this poll at all" (the whole return value
   * null, see below).
   */
  videoId: string | null
}

/**
 * `reachable: false` means the bind request itself failed to reach YouTube
 * (a non-ok response, or the fetch throwing outright) — the strongest signal
 * this integration has that the receiver's Lounge session has actually died
 * (e.g. the TV's YouTube app was closed), as opposed to `reachable: true,
 * nowPlaying: null`, which just means a normal poll came back with no new
 * `nowPlaying` event and says nothing about whether the receiver is still
 * there.
 */
export type LoungeNowPlayingResult =
  | { reachable: true; nowPlaying: LoungeNowPlaying | null }
  | { reachable: false }

/**
 * Best-effort poll of the receiver's current video — the least-verified
 * part of this integration. The reference implementation only demonstrates
 * extracting a playlist id from this same endpoint; the rest of the
 * `nowPlaying` payload's shape is inferred, not confirmed. Only the video id
 * is tracked — play/pause state and playback position aren't surfaced
 * anywhere in the app, so there's no need to parse the timing-related event
 * data at all, beyond noticing when `videoId` itself comes back empty (see
 * `LoungeNowPlaying.videoId`'s doc comment).
 *
 * A single poll response can contain a batch of several queued events, not
 * just one — this takes the *last* `nowPlaying` occurrence rather than
 * stopping at the first match, so a stale, already-superseded event earlier
 * in the batch can't override a newer one later in it.
 */
export async function getLoungeNowPlaying(
  session: LoungeSessionState,
): Promise<LoungeNowPlayingResult> {
  const query = encodeForm({
    loungeIdToken: session.loungeToken,
    VER: 8,
    v: 2,
    RID: "rpc",
    SID: session.sid,
    gsessionid: session.gsessionid,
    TYPE: "xmlhttp",
    t: 1,
    AID: 5,
    CI: 1,
    ...BIND_DATA,
  })

  let res: Response
  try {
    res = await fetch(`${BIND_URL}?${query}`, {
      method: "POST",
      headers: { ...BASE_HEADERS, [LOUNGE_ID_HEADER]: session.loungeToken },
    })
  } catch {
    return { reachable: false }
  }
  if (!res.ok) return { reachable: false }

  // Anything unexpected past this point (unparseable body, odd event shape)
  // is treated as "no event this tick" rather than "unreachable" — the
  // request itself succeeded, so this isn't evidence the receiver is gone,
  // just that this batch didn't have anything usable in it.
  try {
    const text = (await res.text()).replace(/\n/g, "")
    const start = text.indexOf("[")
    if (start === -1) return { reachable: true, nowPlaying: null }
    const events = JSON.parse(text.slice(start)) as Array<[number, [string, unknown]]>

    let nowPlaying: LoungeNowPlaying | null = null
    for (const event of events) {
      const [key, value] = event[1] ?? []
      if (key !== "nowPlaying" || !value || typeof value !== "object") continue
      const data = value as Record<string, unknown>
      const videoId =
        typeof data.videoId === "string" && data.videoId.length > 0
          ? data.videoId
          : null
      nowPlaying = { videoId }
    }
    return { reachable: true, nowPlaying }
  } catch {
    return { reachable: true, nowPlaying: null }
  }
}
