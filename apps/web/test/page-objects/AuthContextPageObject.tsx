import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AuthProvider, useAuth } from "../../context/AuthContext"

function Probe() {
  const { user, loading, register, login, logout } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user ? user.displayName : "none"}</span>
      <button onClick={() => login("sam@example.com", "password123")}>
        login
      </button>
      <button
        onClick={() => register("sam@example.com", "password123", "Sam")}
      >
        register
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

  async login() {
    await this.user.click(screen.getByText("login"))
  }

  async register() {
    await this.user.click(screen.getByText("register"))
  }

  logoutSync() {
    act(() => {
      screen.getByText("logout").click()
    })
  }
}
