import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { JoinRoomForm } from "../../components/JoinRoomForm"

export class JoinRoomFormPageObject {
  private user = userEvent.setup()

  constructor() {
    render(<JoinRoomForm />)
  }

  get nameInput() {
    return screen.getByLabelText("Your name") as HTMLInputElement
  }

  get submitButton() {
    return screen.getByRole("button", { name: /join room/i })
  }

  get errorAlert() {
    return screen.queryByRole("alert")
  }

  async fillName(value: string) {
    await this.user.type(this.nameInput, value)
  }

  async submit() {
    await this.user.click(this.submitButton)
  }
}
