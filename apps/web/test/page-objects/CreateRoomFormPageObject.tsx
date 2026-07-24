import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CreateRoomForm } from "../../components/CreateRoomForm"

export class CreateRoomFormPageObject {
  private user = userEvent.setup()

  constructor() {
    render(<CreateRoomForm />)
  }

  get hostNameInput() {
    return screen.getByLabelText("Your name") as HTMLInputElement
  }

  get submitButton() {
    return screen.getByRole("button", { name: /create room/i })
  }

  async fillHostName(value: string) {
    await this.user.type(this.hostNameInput, value)
  }

  async submit() {
    await this.user.click(this.submitButton)
  }

  findErrorAlert() {
    return screen.findByRole("alert")
  }
}
