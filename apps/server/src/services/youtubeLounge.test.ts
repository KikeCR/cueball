import { afterEach, describe, expect, it, vi } from "vitest"
import {
  addVideoToLoungeQueue,
  bindLoungeSession,
  clearLoungePlaylist,
  getLoungeNowPlaying,
  getLoungeToken,
  pairWithScreenCode,
  rebindLoungeSession,
  removeVideoFromLoungeQueue,
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
  commandOffset: 0,
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

describe("pairWithScreenCode", () => {
  it("posts the pairing code and returns the paired screen", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          screen: {
            screenId: "screen-1",
            loungeToken: "lounge-token",
            name: "Living Room Roku",
          },
        }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await pairWithScreenCode("abcd1234")

    expect(result).toEqual({
      screenId: "screen-1",
      loungeToken: "lounge-token",
      name: "Living Room Roku",
    })
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.youtube.com/api/lounge/pairing/get_screen",
      expect.objectContaining({
        method: "POST",
        body: "pairing_code=abcd1234",
      }),
    )
  })

  it("defaults name to null when the device didn't report one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            screen: { screenId: "screen-1", loungeToken: "lounge-token" },
          }),
      }),
    )

    const result = await pairWithScreenCode("abcd1234")

    expect(result.name).toBeNull()
  })

  it("throws when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    await expect(pairWithScreenCode("bad-code")).rejects.toThrow(
      "Failed to pair with that code",
    )
  })

  it("throws when the response doesn't include a usable screen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
    )
    await expect(pairWithScreenCode("bad-code")).rejects.toThrow(
      "doesn't seem to be valid",
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
      commandOffset: 0,
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

describe("rebindLoungeSession", () => {
  it("carries the running commandOffset across a rebind, even though rid/reqCount reset", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(bindResponseText("new-sid", "new-gsession")),
      }),
    )

    const rebound = await rebindLoungeSession({ ...sampleSession, commandOffset: 7 })

    expect(rebound.commandOffset).toBe(7)
    expect(rebound.rid).toBe(1)
    expect(rebound.reqCount).toBe(0)
    expect(rebound.sid).toBe("new-sid")
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
      "https://www.youtube.com/api/lounge/bc/bind?SID=sid-1&gsessionid=gsession-1&RID=1&VER=8&v=2&TYPE=bind&t=1&AID=0&CI=0&name=CueBall&id=cueballcueballcueballcueba&device=REMOTE_CONTROL&loungeIdToken=lounge-token",
    )
    const body = new URLSearchParams(actionInit.body as string)
    expect(body.get("count")).toBe("1")
    expect(body.get("ofs")).toBe("0")
    expect(body.get("req0__sc")).toBe("setPlaylist")
    expect(body.get("req0_videoId")).toBe("dQw4w9WgXcQ")
    expect(body.get("req0_listId")).toBe("")
    expect(body.get("req0_currentIndex")).toBe("-1")
  })

  it("addVideoToLoungeQueue sends addVideo", async () => {
    const fetchMock = stubRebindThenAction()

    await addVideoToLoungeQueue(sampleSession, "abc123")

    const [, actionInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    const body = new URLSearchParams(actionInit.body as string)
    expect(body.get("req0__sc")).toBe("addVideo")
    expect(body.get("req0_videoId")).toBe("abc123")
  })

  it("removeVideoFromLoungeQueue sends removeVideo", async () => {
    const fetchMock = stubRebindThenAction()

    await removeVideoFromLoungeQueue(sampleSession, "abc123")

    const [, actionInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    const body = new URLSearchParams(actionInit.body as string)
    expect(body.get("req0__sc")).toBe("removeVideo")
    expect(body.get("req0_videoId")).toBe("abc123")
  })

  it("clearLoungePlaylist sends clearPlaylist", async () => {
    const fetchMock = stubRebindThenAction()

    await clearLoungePlaylist(sampleSession)

    const [, actionInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    const body = new URLSearchParams(actionInit.body as string)
    expect(body.get("req0__sc")).toBe("clearPlaylist")
  })

  it("sendLoungeTransportCommand sends the given action with count and ofs, unlike the original version of this file", async () => {
    const fetchMock = stubRebindThenAction()

    await sendLoungeTransportCommand(sampleSession, "pause")

    const [, actionInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    const body = new URLSearchParams(actionInit.body as string)
    expect(body.get("req0__sc")).toBe("pause")
    expect(body.get("count")).toBe("1")
    expect(body.get("ofs")).toBe("0")
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
  it("parses the current video id from a nowPlaying event", async () => {
    const raw =
      '[[0,["nowPlaying",{"videoId":"dQw4w9WgXcQ","currentTime":"12.5"}]]]'
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(raw) }),
    )

    const result = await getLoungeNowPlaying(sampleSession)

    expect(result).toEqual({
      reachable: true,
      nowPlaying: { videoId: "dQw4w9WgXcQ" },
    })
  })

  it("takes the last nowPlaying event in a batch, not the first", async () => {
    const raw =
      '[[0,["nowPlaying",{"videoId":"old-video","currentTime":"200"}]],' +
      '[1,["nowPlaying",{"videoId":"new-video","currentTime":"0"}]]]'
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(raw) }),
    )

    const result = await getLoungeNowPlaying(sampleSession)

    expect(result).toEqual({
      reachable: true,
      nowPlaying: { videoId: "new-video" },
    })
  })

  it("reports videoId null (not the whole result null) when the receiver explicitly signals nothing is playing", async () => {
    const raw = '[[0,["nowPlaying",{"state":"-1","videoId":""}]]]'
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(raw) }),
    )

    const result = await getLoungeNowPlaying(sampleSession)

    expect(result).toEqual({ reachable: true, nowPlaying: { videoId: null } })
  })

  it("reports reachable with no nowPlaying when there's no nowPlaying event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('[[0,["onStateChange",{}]]]'),
      }),
    )
    expect(await getLoungeNowPlaying(sampleSession)).toEqual({
      reachable: true,
      nowPlaying: null,
    })
  })

  it("reports unreachable instead of throwing on a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400 }))
    expect(await getLoungeNowPlaying(sampleSession)).toEqual({ reachable: false })
  })

  it("reports unreachable instead of throwing when the request itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))
    expect(await getLoungeNowPlaying(sampleSession)).toEqual({ reachable: false })
  })

  it("reports reachable with no nowPlaying instead of throwing on unparseable content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("not json at all") }),
    )
    expect(await getLoungeNowPlaying(sampleSession)).toEqual({
      reachable: true,
      nowPlaying: null,
    })
  })
})
