import { beforeEach, describe, expect, it, vi } from "vitest"
import { AccountMenuPageObject } from "../../test/page-objects/AccountMenuPageObject"

const logoutMock = vi.fn()
let mockState: {
  user: { displayName: string; email: string } | null
  loading: boolean
}

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ ...mockState, logout: logoutMock }),
}))

describe("AccountMenu", () => {
  beforeEach(() => {
    logoutMock.mockReset()
    mockState = { user: null, loading: false }
  })

  it("renders nothing while the session is loading", () => {
    mockState = { user: null, loading: true }
    const menu = new AccountMenuPageObject()
    expect(menu.container).toBeEmptyDOMElement()
  })

  it("shows a sign in link when logged out", () => {
    const menu = new AccountMenuPageObject()
    expect(menu.signInLink).toHaveAttribute("href", "/account")
  })

  it("shows the user's name and a sign out button when logged in", async () => {
    mockState = {
      user: { displayName: "Sam", email: "sam@example.com" },
      loading: false,
    }
    const menu = new AccountMenuPageObject()

    expect(menu.hasText("Sam")).toBe(true)
    await menu.clickSignOut()
    expect(logoutMock).toHaveBeenCalled()
  })
})
