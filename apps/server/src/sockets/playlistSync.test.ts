import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SocketEvents } from "@cueball/shared"

vi.mock("../services/youtubePlaylist.js", () => ({
  syncPlaylistOrder: vi.fn(),
  describeYoutubePlaylistError: vi.fn(() => "Ask the host to check their YouTube connection."),
}))

import { syncPlaylistOrder } from "../services/youtubePlaylist.js"
import { schedulePlaylistSync } from "./playlistSync.js"

function fakeIo() {
  const emit = vi.fn()
  return { to: vi.fn(() => ({ emit })), emit } as never as {
    to: ReturnType<typeof vi.fn>
    emit: ReturnType<typeof vi.fn>
  }
}

describe("schedulePlaylistSync", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(syncPlaylistOrder).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("calls syncPlaylistOrder after the debounce window", async () => {
    vi.mocked(syncPlaylistOrder).mockResolvedValue(undefined)
    const io = fakeIo()

    schedulePlaylistSync(io as never, "room-1")
    await vi.advanceTimersByTimeAsync(4000)

    expect(syncPlaylistOrder).toHaveBeenCalledWith("room-1")
  })

  it("coalesces a burst of calls into a single sync", async () => {
    vi.mocked(syncPlaylistOrder).mockResolvedValue(undefined)
    const io = fakeIo()

    schedulePlaylistSync(io as never, "room-1")
    schedulePlaylistSync(io as never, "room-1")
    schedulePlaylistSync(io as never, "room-1")
    await vi.advanceTimersByTimeAsync(4000)

    expect(syncPlaylistOrder).toHaveBeenCalledTimes(1)
  })

  it("notifies the room when the sync fails, so a broken connection isn't silent", async () => {
    vi.mocked(syncPlaylistOrder).mockRejectedValue(new Error("token expired"))
    const io = fakeIo()

    schedulePlaylistSync(io as never, "room-1")
    await vi.advanceTimersByTimeAsync(4000)
    await Promise.resolve()

    expect(io.to).toHaveBeenCalledWith("room-1")
    expect(io.emit).toHaveBeenCalledWith(
      SocketEvents.PlaylistSyncFailed,
      expect.objectContaining({ reason: expect.any(String) }),
    )
  })
})
