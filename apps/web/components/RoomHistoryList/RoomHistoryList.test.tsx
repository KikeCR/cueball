import { waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RoomHistoryListPageObject } from "../../test/page-objects/RoomHistoryListPageObject"

vi.mock("../../api/client", () => ({
  api: { get: vi.fn(), delete: vi.fn() },
}))

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ token: "user-token" }),
}))

const toastErrorMock = vi.fn()
const toastSuccessMock = vi.fn()
vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({ error: toastErrorMock, success: toastSuccessMock }),
}))

import { api } from "../../api/client"

const HOST_ROOM = {
  id: "room-1",
  code: "AAA111",
  name: "Movie night",
  isHost: true,
  lastActiveAt: new Date().toISOString(),
}

const GUEST_ROOM = {
  id: "room-2",
  code: "BBB222",
  name: null,
  isHost: false,
  lastActiveAt: new Date().toISOString(),
}

describe("RoomHistoryList", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.delete).mockReset()
    toastErrorMock.mockReset()
    toastSuccessMock.mockReset()
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

  it("shows the room-expiry note once config loads", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/api/config") return Promise.resolve({ roomExpiryHours: 24 })
      return Promise.resolve({ rooms: [HOST_ROOM] })
    })
    const list = new RoomHistoryListPageObject()
    await list.findRoomName("Movie night")

    expect(
      await list.findByText(/cleared automatically after 24h/i),
    ).toBeInTheDocument()
  })

  it("only shows a delete button for rooms the user hosts", async () => {
    vi.mocked(api.get).mockResolvedValue({ rooms: [HOST_ROOM, GUEST_ROOM] })
    const list = new RoomHistoryListPageObject()
    await list.findRoomName("Movie night")

    expect(list.queryDeleteButtons()).toHaveLength(1)
  })

  it("deletes a room after confirming, removes it from the list, and toasts success", async () => {
    vi.mocked(api.get).mockResolvedValue({ rooms: [HOST_ROOM] })
    vi.mocked(api.delete).mockResolvedValue(undefined)
    const list = new RoomHistoryListPageObject()
    await list.findRoomName("Movie night")

    await list.clickDeleteForRoom()
    await list.confirmDelete()

    expect(api.delete).toHaveBeenCalledWith("/api/rooms/AAA111", "user-token")
    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith("Room deleted"),
    )
    expect(list.queryDeleteButtons()).toHaveLength(0)
  })

  it("does nothing when the delete is cancelled", async () => {
    vi.mocked(api.get).mockResolvedValue({ rooms: [HOST_ROOM] })
    const list = new RoomHistoryListPageObject()
    await list.findRoomName("Movie night")

    await list.clickDeleteForRoom()
    await list.cancelDelete()

    expect(api.delete).not.toHaveBeenCalled()
    expect(list.queryDeleteButtons()).toHaveLength(1)
  })

  it("toasts an error and keeps the room when deletion fails (e.g. someone's still in it)", async () => {
    vi.mocked(api.get).mockResolvedValue({ rooms: [HOST_ROOM] })
    vi.mocked(api.delete).mockRejectedValue(
      new Error("Can't delete a room with people currently in it"),
    )
    const list = new RoomHistoryListPageObject()
    await list.findRoomName("Movie night")

    await list.clickDeleteForRoom()
    await list.confirmDelete()

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Can't delete a room with people currently in it",
      ),
    )
    expect(list.queryDeleteButtons()).toHaveLength(1)
  })
})
