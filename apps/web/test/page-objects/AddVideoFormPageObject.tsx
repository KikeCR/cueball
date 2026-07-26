import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AddVideoForm } from "../../components/AddVideoForm"

export class AddVideoFormPageObject {
  private user = userEvent.setup()

  constructor() {
    render(<AddVideoForm />)
  }

  get linkInput() {
    return screen.getByLabelText(/youtube link/i) as HTMLInputElement
  }

  get submitButton() {
    return screen.getByRole("button", { name: /^add$/i })
  }

  get searchingIndicator() {
    return screen.queryByText(/searching/i)
  }

  get clearButton() {
    return screen.queryByRole("button", { name: /clear search/i })
  }

  async fillLink(value: string) {
    await this.user.type(this.linkInput, value)
  }

  async submit() {
    await this.user.click(this.submitButton)
  }

  queryResultButton(title: string) {
    return screen.queryByRole("button", { name: new RegExp(`^Add ${title}`, "i") })
  }

  async clickResult(title: string) {
    const button = this.queryResultButton(title)
    if (!button) throw new Error(`No search result button for "${title}"`)
    await this.user.click(button)
  }

  async clickClear() {
    if (!this.clearButton) throw new Error("Clear button is not rendered")
    await this.user.click(this.clearButton)
  }

  async clickOutside() {
    await this.user.click(document.body)
  }
}
