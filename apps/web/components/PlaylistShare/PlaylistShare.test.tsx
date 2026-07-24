import { describe, expect, it, vi } from "vitest"
import { PlaylistSharePageObject } from "../../test/page-objects/PlaylistSharePageObject"

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,fake"),
  },
}))

describe("PlaylistShare", () => {
  it("links to the real YouTube playlist and renders the generated QR code", async () => {
    const playlistShare = new PlaylistSharePageObject({ playlistId: "PL123" })

    const link = playlistShare.openPlaylistLink
    expect(link).toHaveAttribute(
      "href",
      "https://www.youtube.com/playlist?list=PL123",
    )
    expect(link).toHaveAttribute("target", "_blank")

    expect(await playlistShare.findQrCodeImage()).toHaveAttribute(
      "src",
      "data:image/png;base64,fake",
    )
  })
})
