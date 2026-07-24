import { beforeEach, describe, expect, it, vi } from "vitest"
import { CopyButtonPageObject } from "../../test/page-objects/CopyButtonPageObject"

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
    const copyButton = new CopyButtonPageObject({
      value: "ABC123",
      label: "Copy room code",
    })

    await copyButton.click()

    expect(writeText).toHaveBeenCalledWith("ABC123")
    expect(copyButton.accessibleName).toBe("Copied")

    expect(
      await copyButton.findByAccessibleName("Copy room code", {
        timeout: 2000,
      }),
    ).toBeInTheDocument()
  })
})
