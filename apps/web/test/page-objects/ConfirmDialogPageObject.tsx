import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ConfirmDialog } from "../../components/ui/confirmDialog"

export class ConfirmDialogPageObject {
  private user = userEvent.setup()

  constructor(
    props: Partial<Parameters<typeof ConfirmDialog>[0]> & {
      onConfirm?: () => void
      onCancel?: () => void
    } = {},
  ) {
    render(
      <ConfirmDialog
        open
        title="Clear the queue?"
        description="This removes every upcoming video."
        onConfirm={props.onConfirm ?? (() => {})}
        onCancel={props.onCancel ?? (() => {})}
        {...props}
      />,
    )
  }

  get dialog() {
    return screen.getByRole("alertdialog")
  }

  queryDialog() {
    return screen.queryByRole("alertdialog")
  }

  get confirmButton() {
    return screen.getByRole("button", { name: /confirm/i })
  }

  get cancelButton() {
    return screen.getByRole("button", { name: /cancel/i })
  }

  async clickConfirm() {
    await this.user.click(this.confirmButton)
  }

  async clickCancel() {
    await this.user.click(this.cancelButton)
  }

  async pressEscape() {
    await this.user.keyboard("{Escape}")
  }

  async clickBackdrop() {
    await this.user.click(this.dialog.parentElement as HTMLElement)
  }
}
