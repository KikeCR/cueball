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

  get playlistModeButton() {
    return screen.getByRole("button", { name: "Playlist" })
  }

  get castModeButton() {
    return screen.getByRole("button", { name: "Cast" })
  }

  queryCastModeButton() {
    return screen.queryByRole("button", { name: "Cast" })
  }

  async fillHostName(value: string) {
    await this.user.type(this.hostNameInput, value)
  }

  async selectCastMode() {
    await this.user.click(this.castModeButton)
  }

  async submit() {
    await this.user.click(this.submitButton)
  }
}
