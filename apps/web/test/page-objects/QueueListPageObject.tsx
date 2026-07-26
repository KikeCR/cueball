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
  onReorder?: (orderedQueueItemIds: string[]) => void
  onSetPlayed?: (queueItemId: string, played: boolean) => void
  onClearHistory?: () => void
  manualOrderActive?: boolean
  repeatEnabled?: boolean
  onSetRepeat?: (enabled: boolean) => void
  reordering?: boolean
  excludeQueueItemId?: string | null
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

  get dragHandles() {
    return screen.queryAllByRole("button", { name: "Drag to reorder" })
  }

  get reorderingBanner() {
    return screen.queryByText(/updating the youtube playlist order/i)
  }

  get markPlayedButton() {
    return screen.queryByRole("button", { name: "Mark as played" })
  }

  get markUnplayedButton() {
    return screen.queryByRole("button", { name: "Mark as not played" })
  }

  get playedHeading() {
    return screen.queryByText("Played videos")
  }

  get clearHistoryButton() {
    return screen.queryByRole("button", { name: /clear history/i })
  }

  async clickClearHistory() {
    const button = this.clearHistoryButton
    if (!button) throw new Error("Clear history button is not rendered")
    await this.user.click(button)
  }

  get repeatToggle() {
    return screen.queryByRole("switch", {
      name: /repeat the queue once everything's played/i,
    })
  }

  async clickRepeatToggle() {
    const toggle = this.repeatToggle
    if (!toggle) throw new Error("Repeat toggle is not rendered")
    await this.user.click(toggle)
  }

  async clickUpvote() {
    await this.user.click(this.upvoteButton)
  }

  async clickRemove() {
    const button = this.removeButton
    if (!button) throw new Error("Remove button is not rendered")
    await this.user.click(button)
  }

  async clickMarkPlayed() {
    const button = this.markPlayedButton
    if (!button) throw new Error("Mark as played button is not rendered")
    await this.user.click(button)
  }

  async clickMarkUnplayed() {
    const button = this.markUnplayedButton
    if (!button) throw new Error("Mark as not played button is not rendered")
    await this.user.click(button)
  }
}
