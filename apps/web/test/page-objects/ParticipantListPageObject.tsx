import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ParticipantWithPresence } from "@cueball/shared"
import { ParticipantList } from "../../components/ParticipantList"

interface ParticipantListProps {
  participants: ParticipantWithPresence[]
  selfId: string | null
  isSelfHost?: boolean
  onRemove?: (participantId: string) => void
}

export class ParticipantListPageObject {
  private user = userEvent.setup()

  constructor(props: ParticipantListProps) {
    render(<ParticipantList {...props} />)
  }

  get emptyMessage() {
    return screen.queryByText("No one here yet.")
  }

  hasName(name: string) {
    return screen.queryByText(name) !== null
  }

  get hostBadge() {
    return screen.queryByText("host")
  }

  get selfBadge() {
    return screen.queryByText("you")
  }

  presenceIndicator(state: "connected" | "disconnected") {
    return screen.queryByLabelText(state)
  }

  removeButton(name: string) {
    return screen.queryByRole("button", { name: `Remove ${name}` })
  }

  async clickRemove(name: string) {
    const button = this.removeButton(name)
    if (!button) throw new Error(`Remove button for ${name} is not rendered`)
    await this.user.click(button)
  }
}
