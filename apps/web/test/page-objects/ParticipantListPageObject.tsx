import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ParticipantWithPresence } from "@cueball/shared"
import { ParticipantList } from "../../components/ParticipantList"

interface ParticipantListProps {
  participants: ParticipantWithPresence[]
  selfId: string | null
  isSelfHost?: boolean
  onRemove?: (participantId: string) => void
  onRename?: (name: string) => void
  onPromote?: (participantId: string) => void
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

  promoteButton(name: string) {
    return screen.queryByRole("button", { name: `Make ${name} a host` })
  }

  async clickPromote(name: string) {
    const button = this.promoteButton(name)
    if (!button) throw new Error(`Promote button for ${name} is not rendered`)
    await this.user.click(button)
  }

  get editNameButton() {
    return screen.queryByRole("button", { name: "Edit your name" })
  }

  get nameInput() {
    return screen.queryByLabelText("Your name") as HTMLInputElement | null
  }

  get saveNameButton() {
    return screen.queryByRole("button", { name: "Save name" })
  }

  get cancelEditButton() {
    return screen.queryByRole("button", { name: "Cancel" })
  }

  async renameTo(name: string) {
    if (!this.editNameButton) throw new Error("Edit name button is not rendered")
    await this.user.click(this.editNameButton)
    const input = this.nameInput
    if (!input) throw new Error("Name input did not appear")
    await this.user.clear(input)
    await this.user.type(input, name)
    const saveButton = this.saveNameButton
    if (!saveButton) throw new Error("Save button did not appear")
    await this.user.click(saveButton)
  }

  async startRenameAndType(draft: string) {
    if (!this.editNameButton) throw new Error("Edit name button is not rendered")
    await this.user.click(this.editNameButton)
    const input = this.nameInput
    if (!input) throw new Error("Name input did not appear")
    await this.user.clear(input)
    await this.user.type(input, draft)
  }

  async cancelRename() {
    if (!this.cancelEditButton) throw new Error("Cancel button is not rendered")
    await this.user.click(this.cancelEditButton)
  }
}
