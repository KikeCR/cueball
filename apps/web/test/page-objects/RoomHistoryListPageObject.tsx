import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RoomHistoryList } from "../../components/RoomHistoryList"

export class RoomHistoryListPageObject {
  private user = userEvent.setup()

  constructor() {
    render(<RoomHistoryList />)
  }

  findRoomName(name: string) {
    return screen.findByText(name)
  }

  findAllByText(text: string) {
    return screen.findAllByText(text)
  }

  findByText(text: string | RegExp) {
    return screen.findByText(text)
  }

  findEmptyMessage() {
    return screen.findByText(/no rooms yet/i)
  }

  findErrorMessage() {
    return screen.findByText(/couldn't load your rooms/i)
  }

  queryDeleteButtons() {
    return screen.queryAllByRole("button", { name: "Delete room" })
  }

  async clickDeleteForRoom(index = 0) {
    const button = this.queryDeleteButtons()[index]
    if (!button) throw new Error(`No delete button at index ${index}`)
    await this.user.click(button)
  }

  async confirmDelete() {
    await this.user.click(screen.getByRole("button", { name: "Yes, delete room" }))
  }

  async cancelDelete() {
    await this.user.click(screen.getByRole("button", { name: "Cancel" }))
  }
}
