import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ThemeProvider } from "../../context/ThemeContext"
import { ThemeToggle } from "../../components/ThemeToggle"

export class ThemeTogglePageObject {
  private user = userEvent.setup()

  constructor() {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
  }

  get button() {
    return screen.getByRole("button")
  }

  get label() {
    return this.button.getAttribute("aria-label")
  }

  async click() {
    await this.user.click(this.button)
  }

  get storedTheme() {
    return window.localStorage.getItem("theme")
  }

  get isDarkClassApplied() {
    return document.documentElement.classList.contains("dark")
  }
}
