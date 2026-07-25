import { beforeEach, describe, expect, it, vi } from "vitest"
import { JoinRoomFormPageObject } from "../../test/page-objects/JoinRoomFormPageObject"

const joinAsGuestMock = vi.fn()
const toastErrorMock = vi.fn()
let authUser: { displayName: string } | null = null

vi.mock("../../context/RoomContext", () => ({
  useRoom: () => ({ joinAsGuest: joinAsGuestMock }),
}))

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: authUser }),
}))

vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({ error: toastErrorMock, success: vi.fn() }),
}))

describe("JoinRoomForm", () => {
  beforeEach(() => {
    joinAsGuestMock.mockReset()
    toastErrorMock.mockReset()
    authUser = null
  })

  it("joins with the entered name", async () => {
    joinAsGuestMock.mockResolvedValue(undefined)
    const form = new JoinRoomFormPageObject()

    await form.fillName("Riley")
    await form.submit()

    expect(joinAsGuestMock).toHaveBeenCalledWith("Riley")
  })

  it("toasts a join error", async () => {
    joinAsGuestMock.mockRejectedValue(new Error("Room not found"))
    const form = new JoinRoomFormPageObject()

    await form.fillName("Riley")
    await form.submit()

    expect(toastErrorMock).toHaveBeenCalledWith("Room not found")
  })

  it("prefills the name for a logged-in user", () => {
    authUser = { displayName: "Riley" }
    const form = new JoinRoomFormPageObject()
    expect(form.nameInput.value).toBe("Riley")
  })
})
