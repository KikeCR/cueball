import { beforeEach, describe, expect, it, vi } from "vitest"
import { RegisterFormPageObject } from "../../test/page-objects/RegisterFormPageObject"

const registerMock = vi.fn()

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ register: registerMock }),
}))

describe("RegisterForm", () => {
  beforeEach(() => {
    registerMock.mockReset()
  })

  it("registers with the entered details and calls onSuccess", async () => {
    registerMock.mockResolvedValue(undefined)
    const onSuccess = vi.fn()
    const form = new RegisterFormPageObject({ onSuccess })

    await form.fillAll({
      displayName: "Sam",
      email: "sam@example.com",
      password: "password123",
      confirmPassword: "password123",
    })
    await form.submit()

    expect(registerMock).toHaveBeenCalledWith(
      "sam@example.com",
      "password123",
      "Sam",
    )
    expect(onSuccess).toHaveBeenCalled()
  })

  it("rejects a password that's too short without calling register", async () => {
    const form = new RegisterFormPageObject()

    await form.fillAll({
      displayName: "Sam",
      email: "sam@example.com",
      password: "short",
      confirmPassword: "short",
    })
    await form.submit()

    expect(await form.findErrorAlert()).toHaveTextContent(
      "at least 8 characters",
    )
    expect(registerMock).not.toHaveBeenCalled()
  })

  it("rejects mismatched passwords without calling register", async () => {
    const form = new RegisterFormPageObject()

    await form.fillAll({
      displayName: "Sam",
      email: "sam@example.com",
      password: "password123",
      confirmPassword: "password456",
    })
    await form.submit()

    expect(await form.findErrorAlert()).toHaveTextContent(
      "Passwords don't match",
    )
    expect(registerMock).not.toHaveBeenCalled()
  })

  it("shows inline field errors instead of native validation when submitted empty", async () => {
    const form = new RegisterFormPageObject()

    await form.submit()

    const alerts = await form.findAllAlerts()
    expect(alerts.map((el) => el.textContent)).toEqual(
      expect.arrayContaining([
        "Display name is required",
        "Email is required",
        expect.stringContaining("at least 8 characters"),
      ]),
    )
    expect(registerMock).not.toHaveBeenCalled()
  })
})
