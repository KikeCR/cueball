import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { GoogleAuthButtonPageObject } from "../../test/page-objects/GoogleAuthButtonPageObject"

describe("GoogleAuthButton", () => {
  const originalLocation = window.location

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "" },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    })
  })

  it("navigates to the backend's Google sign-in endpoint", async () => {
    const button = new GoogleAuthButtonPageObject()

    await button.click()

    expect(window.location.href).toBe(
      "http://localhost:4000/api/auth/google/start",
    )
  })
})
