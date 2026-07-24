import { render, screen } from "@testing-library/react"
import { PlaylistShare } from "../../components/PlaylistShare"

export class PlaylistSharePageObject {
  constructor(props: { playlistId: string }) {
    render(<PlaylistShare {...props} />)
  }

  get openPlaylistLink() {
    return screen.getByRole("link", { name: /open playlist/i })
  }

  findQrCodeImage() {
    return screen.findByAltText("QR code linking to the YouTube playlist")
  }
}
