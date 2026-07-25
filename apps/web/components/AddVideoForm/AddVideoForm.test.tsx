import { waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AddVideoFormPageObject } from "../../test/page-objects/AddVideoFormPageObject"

const addToQueueMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock("../../context/RoomContext", () => ({
  useRoom: () => ({ addToQueue: addToQueueMock }),
}))

vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({ success: toastSuccessMock, error: toastErrorMock }),
}))

describe("AddVideoForm", () => {
  beforeEach(() => {
    addToQueueMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
  })

  it("submits the pasted link, clears the input, and toasts success", async () => {
    addToQueueMock.mockResolvedValue(undefined)
    const form = new AddVideoFormPageObject()

    await form.fillLink("https://youtu.be/dQw4w9WgXcQ")
    await form.submit()

    expect(addToQueueMock).toHaveBeenCalledWith("https://youtu.be/dQw4w9WgXcQ")
    expect(form.linkInput).toHaveValue("")
    expect(toastSuccessMock).toHaveBeenCalledWith("Added to queue")
  })

  it("toasts an error and keeps the input when the server rejects the link", async () => {
    addToQueueMock.mockRejectedValue(new Error("Couldn't find that video"))
    const form = new AddVideoFormPageObject()

    await form.fillLink("https://youtu.be/bad")
    await form.submit()

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("Couldn't find that video"),
    )
    expect(form.linkInput).toHaveValue("https://youtu.be/bad")
  })
})
