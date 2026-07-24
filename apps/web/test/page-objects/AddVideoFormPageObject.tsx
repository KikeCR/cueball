import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AddVideoForm } from "../../components/AddVideoForm"

export class AddVideoFormPageObject {
  private user = userEvent.setup()

  constructor() {
    render(<AddVideoForm />)
  }

  get linkInput() {
    return screen.getByLabelText("YouTube link") as HTMLInputElement
  }

  get submitButton() {
    return screen.getByRole("button", { name: /^add$/i })
  }

  async fillLink(value: string) {
    await this.user.type(this.linkInput, value)
  }

  async submit() {
    await this.user.click(this.submitButton)
  }

  findErrorAlert() {
    return screen.findByRole("alert")
  }
}
