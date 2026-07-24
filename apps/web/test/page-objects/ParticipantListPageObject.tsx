import { render, screen } from "@testing-library/react"
import type { ParticipantWithPresence } from "@cueball/shared"
import { ParticipantList } from "../../components/ParticipantList"

interface ParticipantListProps {
  participants: ParticipantWithPresence[]
  selfId: string | null
}

export class ParticipantListPageObject {
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
}
