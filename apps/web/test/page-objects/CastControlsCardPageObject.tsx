import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CastControlsCard } from "../../components/CastControlsCard"

export class CastControlsCardPageObject {
  private user = userEvent.setup()

  constructor(props: { isHost: boolean }) {
    render(<CastControlsCard {...props} />)
  }

  get connectButton() {
    return screen.getByRole("button", { name: /connect to tv/i })
  }

  get playPauseButton() {
    return screen.getByRole("button", { name: /^(play|pause)$/i })
  }

  get skipButton() {
    return screen.getByRole("button", { name: /skip/i })
  }

  get disconnectButton() {
    return screen.getByRole("button", { name: /disconnect/i })
  }

  queryDisconnectButton() {
    return screen.queryByRole("button", { name: /disconnect/i })
  }

  get seekSlider() {
    return screen.getByRole("slider", { name: /seek/i }) as HTMLInputElement
  }

  querySeekSlider() {
    return screen.queryByRole("slider", { name: /seek/i })
  }

  findText(text: string | RegExp) {
    return screen.findByText(text)
  }

  async clickConnect() {
    await this.user.click(this.connectButton)
  }

  async clickPlayPause() {
    await this.user.click(this.playPauseButton)
  }

  async clickSkip() {
    await this.user.click(this.skipButton)
  }

  async clickDisconnect() {
    await this.user.click(this.disconnectButton)
  }

  seekTo(value: number) {
    fireEvent.change(this.seekSlider, { target: { value: String(value) } })
  }
}
