import { beforeEach, describe, expect, it, vi } from "vitest"
import { JoinRoomFormPageObject } from "../../test/page-objects/JoinRoomFormPageObject"

const joinAsGuestMock = vi.fn()
let joinError: string | null = null

vi.mock("../../context/RoomContext", () => ({
  useRoom: () => ({ joinAsGuest: joinAsGuestMock, joinError }),
}))

describe("JoinRoomForm", () => {
  beforeEach(() => {
    joinAsGuestMock.mockReset()
    joinError = null
  })

  it("joins with the entered name", async () => {
    joinAsGuestMock.mockResolvedValue(undefined)
    const form = new JoinRoomFormPageObject()

    await form.fillName("Riley")
    await form.submit()

    expect(joinAsGuestMock).toHaveBeenCalledWith("Riley")
  })

  it("surfaces a join error from context", () => {
    joinError = "Room not found"
    const form = new JoinRoomFormPageObject()
    expect(form.errorAlert).toHaveTextContent("Room not found")
  })
})
