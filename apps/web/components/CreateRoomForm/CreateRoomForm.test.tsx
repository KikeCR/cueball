import { beforeEach, describe, expect, it, vi } from "vitest"
import { CreateRoomFormPageObject } from "../../test/page-objects/CreateRoomFormPageObject"

const pushMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock("../../api/client", () => ({
  api: { post: vi.fn() },
}))

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ token: null, user: null }),
}))

import { api } from "../../api/client"

describe("CreateRoomForm", () => {
  beforeEach(() => {
    pushMock.mockClear()
    vi.mocked(api.post).mockReset()
    localStorage.clear()
  })

  it("creates a room, stores the participant token, and navigates to it", async () => {
    vi.mocked(api.post).mockResolvedValue({
      room: {
        id: "r1",
        code: "ABC123",
        name: null,
        hostUserId: null,
        youtubePlaylistId: null,
        createdAt: new Date().toISOString(),
      },
      participant: {
        id: "p1",
        roomId: "r1",
        userId: null,
        guestName: "Sam",
        isHost: true,
        joinedAt: new Date().toISOString(),
        connected: true,
      },
      participantToken: "token-123",
    })

    const form = new CreateRoomFormPageObject()

    await form.fillHostName("Sam")
    await form.submit()

    expect(api.post).toHaveBeenCalledWith(
      "/api/rooms",
      { hostName: "Sam", roomName: undefined },
      undefined,
    )
    expect(localStorage.getItem("cueball:room:ABC123")).toContain("token-123")
    expect(pushMock).toHaveBeenCalledWith("/room/ABC123")
  })

  it("shows an error if room creation fails", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Server unavailable"))

    const form = new CreateRoomFormPageObject()

    await form.fillHostName("Sam")
    await form.submit()

    expect(await form.findErrorAlert()).toHaveTextContent(
      "Server unavailable",
    )
    expect(pushMock).not.toHaveBeenCalled()
  })
})
