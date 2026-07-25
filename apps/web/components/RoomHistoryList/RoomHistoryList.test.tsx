import { beforeEach, describe, expect, it, vi } from "vitest"
import { RoomHistoryListPageObject } from "../../test/page-objects/RoomHistoryListPageObject"

vi.mock("../../api/client", () => ({
  api: { get: vi.fn() },
}))

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ token: "user-token" }),
}))

const toastErrorMock = vi.fn()
vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({ error: toastErrorMock, success: vi.fn() }),
}))

import { api } from "../../api/client"

describe("RoomHistoryList", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    toastErrorMock.mockReset()
  })

  it("shows a loading state, then the rooms", async () => {
    vi.mocked(api.get).mockResolvedValue({
      rooms: [
        {
          id: "room-1",
          code: "AAA111",
          name: "Movie night",
          isHost: true,
          lastActiveAt: new Date().toISOString(),
        },
        {
          id: "room-2",
          code: "BBB222",
          name: null,
          isHost: false,
          lastActiveAt: new Date().toISOString(),
        },
      ],
    })

    const list = new RoomHistoryListPageObject()

    expect(await list.findRoomName("Movie night")).toBeInTheDocument()
    expect(await list.findAllByText("BBB222")).toHaveLength(2)
    expect(api.get).toHaveBeenCalledWith("/api/auth/me/rooms", "user-token")
  })

  it("shows an empty state when there are no rooms", async () => {
    vi.mocked(api.get).mockResolvedValue({ rooms: [] })
    const list = new RoomHistoryListPageObject()
    expect(await list.findEmptyMessage()).toBeInTheDocument()
  })

  it("shows a fallback message and toasts the error if the request fails", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("Server unavailable"))
    const list = new RoomHistoryListPageObject()
    expect(await list.findErrorMessage()).toBeInTheDocument()
    expect(toastErrorMock).toHaveBeenCalledWith("Server unavailable")
  })
})
