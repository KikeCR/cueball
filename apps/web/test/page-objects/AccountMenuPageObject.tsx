import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AccountMenu } from "../../components/AccountMenu"

export class AccountMenuPageObject {
  private user = userEvent.setup()
  container: HTMLElement

  constructor() {
    const result = render(<AccountMenu />)
    this.container = result.container
  }

  get signInLink() {
    return screen.queryByRole("link", { name: "Sign in" })
  }

  get signOutButton() {
    return screen.queryByRole("button", { name: "Sign out" })
  }

  hasText(text: string) {
    return screen.queryByText(text) !== null
  }

  async clickSignOut() {
    const button = this.signOutButton
    if (!button) throw new Error("Sign out button is not rendered")
    await this.user.click(button)
  }
}
