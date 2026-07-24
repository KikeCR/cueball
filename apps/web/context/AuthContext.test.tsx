import { waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AuthContextPageObject } from "../test/page-objects/AuthContextPageObject"

vi.mock("../api/client", () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

import { api } from "../api/client"

const USER = {
  id: "user-1",
  email: "sam@example.com",
  displayName: "Sam",
  createdAt: new Date().toISOString(),
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    localStorage.clear()
  })

  it("starts logged out with no stored token", async () => {
    const auth = new AuthContextPageObject()

    await waitFor(() => expect(auth.loadingText).toBe("false"))
    expect(auth.userText).toBe("none")
    expect(api.get).not.toHaveBeenCalled()
  })

  it("restores the session from a stored token", async () => {
    localStorage.setItem("cueball:auth", "stored-token")
    vi.mocked(api.get).mockResolvedValue({ user: USER })

    const auth = new AuthContextPageObject()

    await waitFor(() => expect(auth.userText).toBe("Sam"))
    expect(api.get).toHaveBeenCalledWith("/api/auth/me", "stored-token")
  })

  it("clears the stored token if restoring the session fails", async () => {
    localStorage.setItem("cueball:auth", "stale-token")
    vi.mocked(api.get).mockRejectedValue(new Error("Authentication required"))

    const auth = new AuthContextPageObject()

    await waitFor(() => expect(auth.loadingText).toBe("false"))
    expect(localStorage.getItem("cueball:auth")).toBeNull()
  })

  it("logs in and stores the token", async () => {
    vi.mocked(api.post).mockResolvedValue({ user: USER, token: "new-token" })

    const auth = new AuthContextPageObject()
    await waitFor(() => expect(auth.loadingText).toBe("false"))

    await auth.login()

    await waitFor(() => expect(auth.userText).toBe("Sam"))
    expect(localStorage.getItem("cueball:auth")).toBe("new-token")
  })

  it("adopts a token issued out-of-band (e.g. the Google sign-in redirect)", async () => {
    vi.mocked(api.get).mockResolvedValue({ user: USER })

    const auth = new AuthContextPageObject()
    await waitFor(() => expect(auth.loadingText).toBe("false"))

    await auth.applyToken()

    await waitFor(() => expect(auth.userText).toBe("Sam"))
    expect(api.get).toHaveBeenCalledWith("/api/auth/me", "google-token")
    expect(localStorage.getItem("cueball:auth")).toBe("google-token")
  })

  it("surfaces an error and leaves the session logged out if the token is invalid", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("Authentication required"))

    const auth = new AuthContextPageObject()
    await waitFor(() => expect(auth.loadingText).toBe("false"))

    await auth.applyToken()

    await waitFor(() =>
      expect(auth.applyTokenErrorText).toBe("Authentication required"),
    )
    expect(auth.userText).toBe("none")
    expect(localStorage.getItem("cueball:auth")).toBeNull()
  })

  it("logs out and clears the stored token", async () => {
    vi.mocked(api.post).mockResolvedValue({ user: USER, token: "new-token" })

    const auth = new AuthContextPageObject()
    await waitFor(() => expect(auth.loadingText).toBe("false"))
    await auth.login()
    await waitFor(() => expect(auth.userText).toBe("Sam"))

    auth.logoutSync()

    expect(auth.userText).toBe("none")
    expect(localStorage.getItem("cueball:auth")).toBeNull()
  })
})
