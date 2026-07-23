import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PlaylistShare } from "./PlaylistShare"

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,fake"),
  },
}))

describe("PlaylistShare", () => {
  it("links to the real YouTube playlist and renders the generated QR code", async () => {
    render(<PlaylistShare playlistId="PL123" />)

    const link = screen.getByRole("link", { name: /open playlist/i })
    expect(link).toHaveAttribute(
      "href",
      "https://www.youtube.com/playlist?list=PL123",
    )
    expect(link).toHaveAttribute("target", "_blank")

    expect(
      await screen.findByAltText("QR code linking to the YouTube playlist"),
    ).toHaveAttribute("src", "data:image/png;base64,fake")
  })
})
