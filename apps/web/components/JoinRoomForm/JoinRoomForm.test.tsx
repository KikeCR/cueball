import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { JoinRoomForm } from "./JoinRoomForm"

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
    const user = userEvent.setup()
    render(<JoinRoomForm />)

    await user.type(screen.getByLabelText("Your name"), "Riley")
    await user.click(screen.getByRole("button", { name: /join room/i }))

    expect(joinAsGuestMock).toHaveBeenCalledWith("Riley")
  })

  it("surfaces a join error from context", () => {
    joinError = "Room not found"
    render(<JoinRoomForm />)
    expect(screen.getByRole("alert")).toHaveTextContent("Room not found")
  })
})
