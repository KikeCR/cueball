import { afterEach, describe, expect, it, vi } from "vitest"
import {
  addVideoToLoungeQueue,
  bindLoungeSession,
  clearLoungePlaylist,
  getLoungeNowPlaying,
  getLoungeToken,
  seekLoungeTo,
  sendLoungeTransportCommand,
  setLoungePlaylist,
  startLoungeSession,
  type LoungeSessionState,
} from "./youtubeLounge.js"

function bindResponseText(sid: string, gsessionid: string): string {
  return `[[0,["c","${sid}","",8]]]\n[[1,["S","${gsessionid}"]]]`
}

const sampleSession: LoungeSessionState = {
  screenId: "screen-1",
  loungeToken: "lounge-token",
  sid: "sid-1",
  gsessionid: "gsession-1",
  rid: 1,
  reqCount: 0,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("getLoungeToken", () => {
  it("posts the screen id and returns the lounge token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ screens: [{ loungeToken: "abc123" }] }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const token = await getLoungeToken("screen-1")

    expect(token).toBe("abc123")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.youtube.com/api/lounge/pairing/get_lounge_token_batch",
      expect.objectContaining({
        method: "POST",
        body: "screen_ids=screen-1",
      }),
    )
  })

  it("throws when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(getLoungeToken("screen-1")).rejects.toThrow(
      "Failed to get a YouTube lounge token",
    )
  })

  it("throws when no token is present in the response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ screens: [] }) }),
    )
    await expect(getLoungeToken("screen-1")).rejects.toThrow(
      "didn't return a lounge token",
    )
  })
})

describe("bindLoungeSession", () => {
  it("parses sid and gsessionid from the bind response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(bindResponseText("my-sid", "my-gsessionid")),
    })
    vi.stubGlobal("fetch", fetchMock)

    const session = await bindLoungeSession("screen-1", "lounge-token")

    expect(session).toEqual({
      screenId: "screen-1",
      loungeToken: "lounge-token",
      sid: "my-sid",
      gsessionid: "my-gsessionid",
      rid: 1,
      reqCount: 0,
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      "https://www.youtube.com/api/lounge/bc/bind?RID=0&VER=8&CVER=1",
    )
    expect((init.headers as Record<string, string>)["X-YouTube-LoungeId-Token"]).toBe(
      "lounge-token",
    )
  })

  it("throws when the response can't be parsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("garbage") }),
    )
    await expect(bindLoungeSession("screen-1", "lounge-token")).rejects.toThrow(
      "Couldn't parse a YouTube lounge session",
    )
  })

  it("throws when the bind request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }))
    await expect(bindLoungeSession("screen-1", "lounge-token")).rejects.toThrow(
      "Failed to bind a YouTube lounge session",
    )
  })
})

describe("startLoungeSession", () => {
  it("fetches a token, then binds with it", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("get_lounge_token_batch")) {
        return {
          ok: true,
          json: () => Promise.resolve({ screens: [{ loungeToken: "fresh-token" }] }),
        }
      }
      return { ok: true, text: () => Promise.resolve(bindResponseText("sid", "gsession")) }
    })
    vi.stubGlobal("fetch", fetchMock)

    const session = await startLoungeSession("screen-1")

    expect(session.loungeToken).toBe("fresh-token")
    expect(session.sid).toBe("sid")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe("lounge commands", () => {
  function stubRebindThenAction() {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(bindResponseText("sid-1", "gsession-1")),
    })
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  it("setLoungePlaylist rebinds, then sends setPlaylist with req0-prefixed fields", async () => {
    const fetchMock = stubRebindThenAction()

    await setLoungePlaylist(sampleSession, "dQw4w9WgXcQ")

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [actionUrl, actionInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(actionUrl).toBe(
      "https://www.youtube.com/api/lounge/bc/bind?SID=sid-1&gsessionid=gsession-1&RID=1&VER=8&CVER=1",
    )
    const body = new URLSearchParams(actionInit.body as string)
    expect(body.get("req0__sc")).toBe("setPlaylist")
    expect(body.get("req0_videoId")).toBe("dQw4w9WgXcQ")
    expect(body.get("req0_listId")).toBe("")
    expect(body.get("req0_currentIndex")).toBe("-1")
    expect(body.get("count")).toBe("1")
  })

  it("addVideoToLoungeQueue sends addVideo", async () => {
    const fetchMock = stubRebindThenAction()

    await addVideoToLoungeQueue(sampleSession, "abc123")

    const [, actionInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    const body = new URLSearchParams(actionInit.body as string)
    expect(body.get("req0__sc")).toBe("addVideo")
    expect(body.get("req0_videoId")).toBe("abc123")
  })

  it("clearLoungePlaylist sends clearPlaylist", async () => {
    const fetchMock = stubRebindThenAction()

    await clearLoungePlaylist(sampleSession)

    const [, actionInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    const body = new URLSearchParams(actionInit.body as string)
    expect(body.get("req0__sc")).toBe("clearPlaylist")
  })

  it("sendLoungeTransportCommand sends the given action", async () => {
    const fetchMock = stubRebindThenAction()

    await sendLoungeTransportCommand(sampleSession, "pause")

    const [, actionInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    const body = new URLSearchParams(actionInit.body as string)
    expect(body.get("req0__sc")).toBe("pause")
  })

  it("seekLoungeTo sends seekTo with the target time", async () => {
    const fetchMock = stubRebindThenAction()

    await seekLoungeTo(sampleSession, 42)

    const [, actionInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    const body = new URLSearchParams(actionInit.body as string)
    expect(body.get("req0__sc")).toBe("seekTo")
    expect(body.get("req0_newTime")).toBe("42")
  })

  it("throws when the action request fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(bindResponseText("sid-1", "gsession-1")),
      })
      .mockResolvedValueOnce({ ok: false, status: 400 })
    vi.stubGlobal("fetch", fetchMock)

    await expect(setLoungePlaylist(sampleSession, "abc")).rejects.toThrow(
      "YouTube lounge command failed",
    )
  })
})

describe("getLoungeNowPlaying", () => {
  it("parses the current video id and time from a nowPlaying event", async () => {
    const raw =
      '[[0,["nowPlaying",{"videoId":"dQw4w9WgXcQ","currentTime":"12.5"}]]]'
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(raw) }),
    )

    const result = await getLoungeNowPlaying(sampleSession)

    expect(result).toEqual({ videoId: "dQw4w9WgXcQ", currentTimeSeconds: 12.5 })
  })

  it("returns null when there's no nowPlaying event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('[[0,["onStateChange",{}]]]'),
      }),
    )
    expect(await getLoungeNowPlaying(sampleSession)).toBeNull()
  })

  it("returns null instead of throwing on a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }))
    expect(await getLoungeNowPlaying(sampleSession)).toBeNull()
  })

  it("returns null instead of throwing on unparseable content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("not json at all") }),
    )
    expect(await getLoungeNowPlaying(sampleSession)).toBeNull()
  })
})
