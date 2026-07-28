import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../redis/castSession.js", () => ({
  getCastState: vi.fn(),
  setCastState: vi.fn(),
  clearCastState: vi.fn(),
}))
vi.mock("../redis/castLoungeSession.js", () => ({
  getLoungeSessionState: vi.fn(),
  setLoungeSessionState: vi.fn(),
  clearLoungeSessionState: vi.fn(),
}))
vi.mock("../services/youtubeLounge.js", () => ({
  getLoungeNowPlaying: vi.fn(),
  setLoungePlaylist: vi.fn(),
  addVideoToLoungeQueue: vi.fn(),
}))
vi.mock("./broadcast.js", () => ({
  broadcastRoomState: vi.fn(),
}))

import { clearCastState, getCastState } from "../redis/castSession.js"
import {
  clearLoungeSessionState,
  getLoungeSessionState,
} from "../redis/castLoungeSession.js"
import { getLoungeNowPlaying } from "../services/youtubeLounge.js"
import { broadcastRoomState } from "./broadcast.js"
import { pollRoom } from "./castLoungePolling.js"

const sampleSession = {
  screenId: "screen-1",
  loungeToken: "lounge-token",
  sid: "sid-1",
  gsessionid: "gsession-1",
  rid: 1,
  reqCount: 0,
  commandOffset: 0,
}

const sampleCast = {
  connected: true,
  deviceName: "Living Room TV",
  casterParticipantId: "p1",
  isPlaying: true,
  currentQueueItemId: "q1",
  restarting: false,
}

function fakeIo() {
  return { to: vi.fn(), emit: vi.fn() } as never as Parameters<typeof pollRoom>[0]
}

describe("pollRoom disconnect detection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getLoungeSessionState).mockResolvedValue(sampleSession)
    vi.mocked(getCastState).mockResolvedValue(sampleCast)
    vi.mocked(broadcastRoomState).mockResolvedValue(undefined)
    vi.mocked(clearCastState).mockResolvedValue(undefined)
    vi.mocked(clearLoungeSessionState).mockResolvedValue(undefined)
  })

  it("does not clear cast state on a single failed poll", async () => {
    vi.mocked(getLoungeNowPlaying).mockResolvedValue({ reachable: false })

    await pollRoom(fakeIo(), "room-1")

    expect(clearCastState).not.toHaveBeenCalled()
    expect(clearLoungeSessionState).not.toHaveBeenCalled()
  })

  it("clears cast and lounge state after sustained bind failures", async () => {
    vi.mocked(getLoungeNowPlaying).mockResolvedValue({ reachable: false })

    for (let i = 0; i < 10; i++) {
      await pollRoom(fakeIo(), "room-2")
    }

    expect(clearCastState).toHaveBeenCalledWith("room-2")
    expect(clearLoungeSessionState).toHaveBeenCalledWith("room-2")
    expect(broadcastRoomState).toHaveBeenCalled()
  })

  it("resets the failure count once a poll succeeds again", async () => {
    vi.mocked(getLoungeNowPlaying).mockResolvedValue({ reachable: false })
    for (let i = 0; i < 9; i++) {
      await pollRoom(fakeIo(), "room-3")
    }

    vi.mocked(getLoungeNowPlaying).mockResolvedValue({
      reachable: true,
      nowPlaying: null,
    })
    await pollRoom(fakeIo(), "room-3")

    vi.mocked(getLoungeNowPlaying).mockResolvedValue({ reachable: false })
    for (let i = 0; i < 9; i++) {
      await pollRoom(fakeIo(), "room-3")
    }

    expect(clearCastState).not.toHaveBeenCalled()
  })
})
