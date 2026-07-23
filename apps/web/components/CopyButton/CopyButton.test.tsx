import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CopyButton } from "./CopyButton"

describe("CopyButton", () => {
  const writeText = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    writeText.mockClear()
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    })
  })

  it("copies the value to the clipboard and shows confirmation, then reverts", async () => {
    render(<CopyButton value="ABC123" label="Copy room code" />)

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy room code" }))
    })

    expect(writeText).toHaveBeenCalledWith("ABC123")
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument()

    expect(
      await screen.findByRole(
        "button",
        { name: "Copy room code" },
        { timeout: 2000 },
      ),
    ).toBeInTheDocument()
  })
})
