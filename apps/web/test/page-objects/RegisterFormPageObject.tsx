import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RegisterForm } from "../../components/RegisterForm"

export class RegisterFormPageObject {
  private user = userEvent.setup()

  constructor(props: { onSuccess?: () => void } = {}) {
    render(<RegisterForm {...props} />)
  }

  get displayNameInput() {
    return screen.getByLabelText("Display name") as HTMLInputElement
  }

  get emailInput() {
    return screen.getByLabelText("Email") as HTMLInputElement
  }

  get passwordInput() {
    return screen.getByLabelText("Password") as HTMLInputElement
  }

  get confirmPasswordInput() {
    return screen.getByLabelText("Confirm password") as HTMLInputElement
  }

  get submitButton() {
    return screen.getByRole("button", { name: /create account/i })
  }

  async fillDisplayName(value: string) {
    await this.user.type(this.displayNameInput, value)
  }

  async fillEmail(value: string) {
    await this.user.type(this.emailInput, value)
  }

  async fillPassword(value: string) {
    await this.user.type(this.passwordInput, value)
  }

  async fillConfirmPassword(value: string) {
    await this.user.type(this.confirmPasswordInput, value)
  }

  async fillAll(fields: {
    displayName: string
    email: string
    password: string
    confirmPassword: string
  }) {
    await this.fillDisplayName(fields.displayName)
    await this.fillEmail(fields.email)
    await this.fillPassword(fields.password)
    await this.fillConfirmPassword(fields.confirmPassword)
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
