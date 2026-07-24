import { describe, expect, it } from "vitest"
import { ThemeTogglePageObject } from "../../test/page-objects/ThemeTogglePageObject"

describe("ThemeToggle", () => {
  it("defaults to a switch-to-dark label when the system prefers light", () => {
    const toggle = new ThemeTogglePageObject()
    expect(toggle.label).toBe("Switch to dark theme")
  })

  it("flips the label and persists the choice to localStorage on click", async () => {
    const toggle = new ThemeTogglePageObject()

    await toggle.click()

    expect(toggle.label).toBe("Switch to light theme")
    expect(toggle.storedTheme).toBe("dark")
    expect(toggle.isDarkClassApplied).toBe(true)
  })
})
