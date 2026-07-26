import { act, render, screen } from "@testing-library/react"
import { useState } from "react"
import userEvent from "@testing-library/user-event"
import { AuthProvider, useAuth } from "../../context/AuthContext"

function Probe() {
  const { user, loading, register, login, applyToken, logout } = useAuth()
  const [applyTokenError, setApplyTokenError] = useState<string | null>(null)

  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.displayName : "none"}</span>
      <span data-testid="apply-token-error">{applyTokenError ?? "none"}</span>
      <button onClick={() => login("sam@example.com", "password123")}>
        login
      </button>
      <button
        onClick={() => register("sam@example.com", "password123", "Sam")}
      >
        register
      </button>
      <button
        onClick={() => {
          setApplyTokenError(null)
          applyToken("google-token").catch((err: unknown) =>
            setApplyTokenError(err instanceof Error ? err.message : "failed"),
          )
        }}
      >
        apply-token
      </button>
      <button onClick={logout}>logout</button>
    </div>
  )
}

export class AuthContextPageObject {
  private user = userEvent.setup()

  constructor() {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
  }

  get loadingText() {
    return screen.getByTestId("loading").textContent
  }

  get userText() {
    return screen.getByTestId("user").textContent
  }

  get applyTokenErrorText() {
    return screen.getByTestId("apply-token-error").textContent
  }

  async login() {
    await this.user.click(screen.getByText("login"))
  }

  async register() {
    await this.user.click(screen.getByText("register"))
  }

  async applyToken() {
    await this.user.click(screen.getByText("apply-token"))
  }

  logoutSync() {
    act(() => {
      screen.getByText("logout").click()
    })
  }
}
