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

const BIND_DATA: Record<string, string | number> = {
  device: "REMOTE_CONTROL",
  id: SENDER_DEVICE_ID,
  name: "CueBall",
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
  return { screenId, loungeToken, sid, gsessionid, rid: 1, reqCount: 0 }
}

/** First-time setup for a newly connected Cast session: token, then bind. */
export async function startLoungeSession(
  screenId: string,
): Promise<LoungeSessionState> {
  const loungeToken = await getLoungeToken(screenId)
  return bindLoungeSession(screenId, loungeToken)
}

export function rebindLoungeSession(
  session: LoungeSessionState,
): Promise<LoungeSessionState> {
  return bindLoungeSession(session.screenId, session.loungeToken)
}

/** Sends one command against an already-bound session. */
async function sendLoungeAction(
  session: LoungeSessionState,
  fields: Record<string, string | number>,
): Promise<LoungeSessionState> {
  const prefixed: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(fields)) {
    prefixed[key.startsWith("_") ? `req${session.reqCount}${key}` : key] = value
  }

  const query = encodeForm({
    SID: session.sid,
    gsessionid: session.gsessionid,
    RID: session.rid,
    VER: 8,
    CVER: 1,
  })
  const res = await fetch(`${BIND_URL}?${query}`, {
    method: "POST",
    headers: { ...BASE_HEADERS, [LOUNGE_ID_HEADER]: session.loungeToken },
    body: encodeForm(prefixed),
  })
  if (!res.ok) {
    throw new Error(`YouTube lounge command failed (status ${res.status})`)
  }
  return { ...session, rid: session.rid + 1, reqCount: session.reqCount + 1 }
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
    count: 1,
  })
}

/** Appends to the end of the receiver's own live queue — it auto-advances into these itself once the current video ends. */
export async function addVideoToLoungeQueue(
  session: LoungeSessionState,
  videoId: string,
): Promise<LoungeSessionState> {
  const bound = await rebindLoungeSession(session)
  return sendLoungeAction(bound, { __sc: "addVideo", _videoId: videoId, count: 1 })
}

export async function clearLoungePlaylist(
  session: LoungeSessionState,
): Promise<LoungeSessionState> {
  const bound = await rebindLoungeSession(session)
  return sendLoungeAction(bound, { __sc: "clearPlaylist", _videoId: "", count: 1 })
}

export type LoungeTransportAction = "play" | "pause" | "next" | "previous"

/**
 * Not demonstrated in the reference implementation this file is otherwise
 * based on — these action names are consistently reported across several
 * independent community write-ups of this same protocol, but unverified
 * here against a real device. Likeliest thing to need adjustment once
 * tested live.
 */
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
  videoId: string | null
  currentTimeSeconds: number | null
}

/**
 * Best-effort poll of the receiver's current state — the least-verified
 * part of this integration. The reference implementation only demonstrates
 * extracting a playlist id from this same endpoint; the rest of the
 * `nowPlaying` payload's shape is inferred, not confirmed. Returns null on
 * anything unexpected rather than throwing, since this drives a polling
 * loop that must never take the server down.
 */
export async function getLoungeNowPlaying(
  session: LoungeSessionState,
): Promise<LoungeNowPlaying | null> {
  try {
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
    const res = await fetch(`${BIND_URL}?${query}`, {
      method: "POST",
      headers: { ...BASE_HEADERS, [LOUNGE_ID_HEADER]: session.loungeToken },
    })
    if (!res.ok) return null

    const text = (await res.text()).replace(/\n/g, "")
    const start = text.indexOf("[")
    if (start === -1) return null
    const events = JSON.parse(text.slice(start)) as Array<[number, [string, unknown]]>

    for (const event of events) {
      const [key, value] = event[1] ?? []
      if (key !== "nowPlaying" || !value || typeof value !== "object") continue
      const data = value as Record<string, unknown>
      const videoId = typeof data.videoId === "string" ? data.videoId : null
      const currentTimeRaw = data.currentTime
      const currentTimeSeconds =
        typeof currentTimeRaw === "string" || typeof currentTimeRaw === "number"
          ? Number(currentTimeRaw)
          : null
      return { videoId, currentTimeSeconds }
    }
    return null
  } catch {
    return null
  }
}
