import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConnectYoutubeButton } from "../../components/ConnectYoutubeButton"

interface ConnectYoutubeButtonProps {
  roomId: string
  roomCode: string
}

export class ConnectYoutubeButtonPageObject {
  private user = userEvent.setup()

  constructor(props: ConnectYoutubeButtonProps) {
    render(<ConnectYoutubeButton {...props} />)
  }

  get button() {
    return screen.getByRole("button", { name: /connect youtube/i })
  }

  async click() {
    await this.user.click(this.button)
  }
}
