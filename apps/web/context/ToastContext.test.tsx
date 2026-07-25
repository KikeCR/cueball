import { act } from "@testing-library/react"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { ToastContextPageObject } from "../test/page-objects/ToastContextPageObject"

describe("ToastContext", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows a success toast", async () => {
    const toasts = new ToastContextPageObject()
    await toasts.fireSuccess()
    expect(await toasts.findToast("Video added")).toBeInTheDocument()
  })

  it("shows an error toast", async () => {
    const toasts = new ToastContextPageObject()
    await toasts.fireError()
    expect(await toasts.findToast("Something broke")).toBeInTheDocument()
  })

  it("dismisses a toast when its close button is clicked", async () => {
    const toasts = new ToastContextPageObject()
    await toasts.fireSuccess()
    await toasts.findToast("Video added")

    await toasts.dismiss("Video added")

    expect(toasts.queryToast("Video added")).not.toBeInTheDocument()
  })

  it("auto-dismisses after 5 seconds", async () => {
    const toasts = new ToastContextPageObject()
    await toasts.fireSuccess()
    await toasts.findToast("Video added")

    await act(() => vi.advanceTimersByTimeAsync(5000))

    expect(toasts.queryToast("Video added")).not.toBeInTheDocument()
  })
})
