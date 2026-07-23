import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ConnectYoutubeButton } from "./ConnectYoutubeButton"

vi.mock("../../utils/participantSession", () => ({
  getStoredParticipantToken: vi.fn(),
}))

import { getStoredParticipantToken } from "../../utils/participantSession"

describe("ConnectYoutubeButton", () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.mocked(getStoredParticipantToken).mockReset()
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "" },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    })
  })

  it("navigates to the connect endpoint with the stored participant token", async () => {
    vi.mocked(getStoredParticipantToken).mockReturnValue("token-123")
    const user = userEvent.setup()
    render(<ConnectYoutubeButton roomId="room-1" roomCode="ABC123" />)

    await user.click(screen.getByRole("button", { name: /connect youtube/i }))

    expect(getStoredParticipantToken).toHaveBeenCalledWith("ABC123")
    expect(window.location.href).toBe(
      "http://localhost:4000/api/rooms/room-1/youtube/connect?token=token-123",
    )
  })

  it("does nothing without a stored token", async () => {
    vi.mocked(getStoredParticipantToken).mockReturnValue(null)
    const user = userEvent.setup()
    render(<ConnectYoutubeButton roomId="room-1" roomCode="ABC123" />)

    await user.click(screen.getByRole("button", { name: /connect youtube/i }))

    expect(window.location.href).toBe("")
  })
})
