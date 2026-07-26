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

  queryConnectButton() {
    return screen.queryByRole("button", { name: /connect to tv/i })
  }

  get pairingCodeInput() {
    return screen.getByPlaceholderText(
      /code shown in the youtube app/i,
    ) as HTMLInputElement
  }

  queryPairingCodeInput() {
    return screen.queryByPlaceholderText(/code shown in the youtube app/i)
  }

  get pairingCodeSubmitButton() {
    return screen.getByRole("button", { name: /^connect$/i })
  }

  get toggleCodeEntryButton() {
    return screen.getByText(/enter its youtube code instead/i)
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

  findText(text: string | RegExp) {
    return screen.findByText(text)
  }

  async clickConnect() {
    await this.user.click(this.connectButton)
  }

  async clickToggleCodeEntry() {
    await this.user.click(this.toggleCodeEntryButton)
  }

  async fillPairingCode(code: string) {
    await this.user.type(this.pairingCodeInput, code)
  }

  async submitPairingCode() {
    await this.user.click(this.pairingCodeSubmitButton)
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
}
