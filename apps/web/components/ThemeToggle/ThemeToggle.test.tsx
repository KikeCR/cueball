import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { ThemeProvider } from "../../context/ThemeContext"
import { ThemeToggle } from "./ThemeToggle"

describe("ThemeToggle", () => {
  it("defaults to a switch-to-dark label when the system prefers light", () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    expect(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    ).toBeInTheDocument()
  })

  it("flips the label and persists the choice to localStorage on click", async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )

    await user.click(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    )

    expect(
      screen.getByRole("button", { name: "Switch to light theme" }),
    ).toBeInTheDocument()
    expect(localStorage.getItem("theme")).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })
})
