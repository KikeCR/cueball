import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { GoogleAuthButton } from "../../components/GoogleAuthButton"

export class GoogleAuthButtonPageObject {
  private user = userEvent.setup()

  constructor() {
    render(<GoogleAuthButton />)
  }

  get button() {
    return screen.getByRole("button", { name: /continue with google/i })
  }

  async click() {
    await this.user.click(this.button)
  }
}
