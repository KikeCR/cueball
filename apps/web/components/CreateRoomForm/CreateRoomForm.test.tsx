import { waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CreateRoomFormPageObject } from "../../test/page-objects/CreateRoomFormPageObject"

const pushMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock("../../api/client", () => ({
  api: { post: vi.fn() },
}))

let authUser: { displayName: string } | null = null

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ token: null, user: authUser }),
}))

const toastErrorMock = vi.fn()
vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({ error: toastErrorMock, success: vi.fn() }),
}))

import { api } from "../../api/client"

describe("CreateRoomForm", () => {
  beforeEach(() => {
    pushMock.mockClear()
    toastErrorMock.mockReset()
    vi.mocked(api.post).mockReset()
    localStorage.clear()
    authUser = null
  })

  it("creates a room, stores the participant token, and navigates to it", async () => {
    vi.mocked(api.post).mockResolvedValue({
      room: {
        id: "r1",
        code: "ABC123",
        name: null,
        mode: "playlist",
        hostUserId: null,
        youtubePlaylistId: null,
        manualQueueOrder: false,
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
      { hostName: "Sam", roomName: undefined, mode: "playlist" },
      undefined,
    )
    expect(localStorage.getItem("cueball:room:ABC123")).toContain("token-123")
    expect(pushMock).toHaveBeenCalledWith("/room/ABC123")
  })

  it("hides the Cast option for guests (not signed in)", async () => {
    const form = new CreateRoomFormPageObject()
    expect(form.queryCastModeButton()).not.toBeInTheDocument()
  })

  it("shows and sends cast mode once selected, for a signed-in user", async () => {
    authUser = { displayName: "Sam" }
    vi.mocked(api.post).mockResolvedValue({
      room: {
        id: "r1",
        code: "ABC123",
        name: null,
        mode: "cast",
        hostUserId: null,
        youtubePlaylistId: null,
        manualQueueOrder: false,
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

    await form.selectCastMode()
    await form.submit()

    expect(api.post).toHaveBeenCalledWith(
      "/api/rooms",
      { hostName: "Sam", roomName: undefined, mode: "cast" },
      undefined,
    )
  })

  it("toasts an error if room creation fails", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Server unavailable"))

    const form = new CreateRoomFormPageObject()

    await form.fillHostName("Sam")
    await form.submit()

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("Server unavailable"),
    )
    expect(pushMock).not.toHaveBeenCalled()
  })
})
