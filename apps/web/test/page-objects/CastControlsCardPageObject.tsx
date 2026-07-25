import { render, screen } from "@testing-library/react"
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
}
