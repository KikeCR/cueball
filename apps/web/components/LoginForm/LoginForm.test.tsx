import { beforeEach, describe, expect, it, vi } from "vitest"
import { LoginFormPageObject } from "../../test/page-objects/LoginFormPageObject"

const loginMock = vi.fn()

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ login: loginMock }),
}))

describe("LoginForm", () => {
  beforeEach(() => {
    loginMock.mockReset()
  })

  it("logs in with the entered credentials and calls onSuccess", async () => {
    loginMock.mockResolvedValue(undefined)
    const onSuccess = vi.fn()
    const form = new LoginFormPageObject({ onSuccess })

    await form.fillEmail("sam@example.com")
    await form.fillPassword("password123")
    await form.submit()

    expect(loginMock).toHaveBeenCalledWith("sam@example.com", "password123")
    expect(onSuccess).toHaveBeenCalled()
  })

  it("shows an error if login fails", async () => {
    loginMock.mockRejectedValue(new Error("Invalid email or password"))
    const form = new LoginFormPageObject()

    await form.fillEmail("sam@example.com")
    await form.fillPassword("wrong-password")
    await form.submit()

    expect(await form.findErrorAlert()).toHaveTextContent(
      "Invalid email or password",
    )
  })

  it("shows inline field errors instead of native validation when submitted empty", async () => {
    const form = new LoginFormPageObject()

    await form.submit()

    const alerts = await form.findAllAlerts()
    expect(alerts.map((el) => el.textContent)).toEqual(
      expect.arrayContaining(["Email is required", "Password is required"]),
    )
    expect(loginMock).not.toHaveBeenCalled()
  })
})
