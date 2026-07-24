import { render, screen } from "@testing-library/react"
import { RoomHistoryList } from "../../components/RoomHistoryList"

export class RoomHistoryListPageObject {
  constructor() {
    render(<RoomHistoryList />)
  }

  findRoomName(name: string) {
    return screen.findByText(name)
  }

  findAllByText(text: string) {
    return screen.findAllByText(text)
  }

  findEmptyMessage() {
    return screen.findByText(/no rooms yet/i)
  }

  findErrorAlert() {
    return screen.findByRole("alert")
  }
}
