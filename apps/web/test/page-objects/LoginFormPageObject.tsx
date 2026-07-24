import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LoginForm } from "../../components/LoginForm"

export class LoginFormPageObject {
  private user = userEvent.setup()

  constructor(props: { onSuccess?: () => void } = {}) {
    render(<LoginForm {...props} />)
  }

  get emailInput() {
    return screen.getByLabelText("Email") as HTMLInputElement
  }

  get passwordInput() {
    return screen.getByLabelText("Password") as HTMLInputElement
  }

  get submitButton() {
    return screen.getByRole("button", { name: /sign in/i })
  }

  async fillEmail(value: string) {
    await this.user.type(this.emailInput, value)
  }

  async fillPassword(value: string) {
    await this.user.type(this.passwordInput, value)
  }

  async submit() {
    await this.user.click(this.submitButton)
  }

  findErrorAlert() {
    return screen.findByRole("alert")
  }

  findAllAlerts() {
    return screen.findAllByRole("alert")
  }
}
