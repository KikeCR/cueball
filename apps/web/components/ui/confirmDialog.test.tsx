import { describe, expect, it, vi } from "vitest"
import { ConfirmDialogPageObject } from "../../test/page-objects/ConfirmDialogPageObject"

describe("ConfirmDialog", () => {
  it("shows the title and description", () => {
    const dialog = new ConfirmDialogPageObject()
    expect(dialog.dialog).toHaveTextContent("Clear the queue?")
    expect(dialog.dialog).toHaveTextContent(
      "This removes every upcoming video.",
    )
  })

  it("calls onConfirm when the confirm button is clicked", async () => {
    const onConfirm = vi.fn()
    const dialog = new ConfirmDialogPageObject({ onConfirm })
    await dialog.clickConfirm()
    expect(onConfirm).toHaveBeenCalled()
  })

  it("calls onCancel when the cancel button is clicked", async () => {
    const onCancel = vi.fn()
    const dialog = new ConfirmDialogPageObject({ onCancel })
    await dialog.clickCancel()
    expect(onCancel).toHaveBeenCalled()
  })

  it("calls onCancel when Escape is pressed", async () => {
    const onCancel = vi.fn()
    const dialog = new ConfirmDialogPageObject({ onCancel })
    await dialog.pressEscape()
    expect(onCancel).toHaveBeenCalled()
  })

  it("calls onCancel when clicking the backdrop", async () => {
    const onCancel = vi.fn()
    const dialog = new ConfirmDialogPageObject({ onCancel })
    await dialog.clickBackdrop()
    expect(onCancel).toHaveBeenCalled()
  })

  it("renders nothing when closed", () => {
    const dialog = new ConfirmDialogPageObject({ open: false })
    expect(dialog.queryDialog()).not.toBeInTheDocument()
  })
})
