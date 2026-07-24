import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ParticipantWithPresence, QueueItem } from "@cueball/shared"
import { QueueList } from "../../components/QueueList"

interface QueueListProps {
  queue: QueueItem[]
  participants: ParticipantWithPresence[]
  selfId: string | null
  onVote: (queueItemId: string, value: 1 | -1) => void
  onRemove: (queueItemId: string) => void
}

export class QueueListPageObject {
  private user = userEvent.setup()

  constructor(props: QueueListProps) {
    render(<QueueList {...props} />)
  }

  get emptyMessage() {
    return screen.queryByText(/queue is empty/i)
  }

  hasText(text: string | RegExp) {
    return screen.queryByText(text) !== null
  }

  get score() {
    return screen.getByLabelText("score")
  }

  get upvoteButton() {
    return screen.getByRole("button", { name: "Upvote" })
  }

  get downvoteButton() {
    return screen.getByRole("button", { name: "Downvote" })
  }

  get removeButton() {
    return screen.queryByRole("button", { name: "Remove from queue" })
  }

  async clickUpvote() {
    await this.user.click(this.upvoteButton)
  }

  async clickRemove() {
    const button = this.removeButton
    if (!button) throw new Error("Remove button is not rendered")
    await this.user.click(button)
  }
}
