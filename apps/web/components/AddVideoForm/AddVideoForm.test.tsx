import { waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AddVideoFormPageObject } from "../../test/page-objects/AddVideoFormPageObject"

const addToQueueMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()
const apiGetMock = vi.fn()

vi.mock("../../context/RoomContext", () => ({
  useRoom: () => ({ addToQueue: addToQueueMock }),
}))

vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({ success: toastSuccessMock, error: toastErrorMock }),
}))

vi.mock("../../api/client", () => ({
  api: { get: (...args: unknown[]) => apiGetMock(...args) },
}))

describe("AddVideoForm", () => {
  beforeEach(() => {
    addToQueueMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
    apiGetMock.mockReset()
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

  it("doesn't search when the input looks like a pasted link", async () => {
    const form = new AddVideoFormPageObject()
    await form.fillLink("https://youtu.be/dQw4w9WgXcQ")

    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(apiGetMock).not.toHaveBeenCalled()
  }, 10000)

  it("doesn't search for very short queries", async () => {
    const form = new AddVideoFormPageObject()
    await form.fillLink("ab")

    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(apiGetMock).not.toHaveBeenCalled()
  }, 10000)

  it("searches after a debounce pause and shows results", async () => {
    apiGetMock.mockResolvedValue({
      results: [
        {
          videoId: "abc123",
          title: "Some Song",
          thumbnailUrl: null,
          channelTitle: "Some Channel",
        },
      ],
    })
    const form = new AddVideoFormPageObject()

    await form.fillLink("some song")

    await waitFor(
      () => expect(form.queryResultButton("Some Song")).toBeInTheDocument(),
      { timeout: 2000 },
    )
    expect(apiGetMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/youtube/search?q=some%20song"),
    )
  }, 10000)

  it("adds the selected search result to the queue and clears the input", async () => {
    addToQueueMock.mockResolvedValue(undefined)
    apiGetMock.mockResolvedValue({
      results: [
        {
          videoId: "abc123",
          title: "Some Song",
          thumbnailUrl: null,
          channelTitle: "Some Channel",
        },
      ],
    })
    const form = new AddVideoFormPageObject()

    await form.fillLink("some song")
    await waitFor(
      () => expect(form.queryResultButton("Some Song")).toBeInTheDocument(),
      { timeout: 2000 },
    )
    await form.clickResult("Some Song")

    expect(addToQueueMock).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=abc123",
    )
    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith("Added to queue"),
    )
    expect(form.linkInput).toHaveValue("")
  }, 10000)

  it("clears the query and hides results when the clear button is clicked", async () => {
    apiGetMock.mockResolvedValue({
      results: [
        {
          videoId: "abc123",
          title: "Some Song",
          thumbnailUrl: null,
          channelTitle: "Some Channel",
        },
      ],
    })
    const form = new AddVideoFormPageObject()

    await form.fillLink("some song")
    await waitFor(
      () => expect(form.queryResultButton("Some Song")).toBeInTheDocument(),
      { timeout: 2000 },
    )

    await form.clickClear()

    expect(form.linkInput).toHaveValue("")
    expect(form.queryResultButton("Some Song")).not.toBeInTheDocument()
  }, 10000)

  it("hides the results when clicking outside, without clearing the input", async () => {
    apiGetMock.mockResolvedValue({
      results: [
        {
          videoId: "abc123",
          title: "Some Song",
          thumbnailUrl: null,
          channelTitle: "Some Channel",
        },
      ],
    })
    const form = new AddVideoFormPageObject()

    await form.fillLink("some song")
    await waitFor(
      () => expect(form.queryResultButton("Some Song")).toBeInTheDocument(),
      { timeout: 2000 },
    )

    await form.clickOutside()

    expect(form.queryResultButton("Some Song")).not.toBeInTheDocument()
    expect(form.linkInput).toHaveValue("some song")
  }, 10000)

  it("silently drops a failed search instead of toasting an error", async () => {
    apiGetMock.mockRejectedValue(new Error("quota exceeded"))
    const form = new AddVideoFormPageObject()

    await form.fillLink("some song")

    await waitFor(() => expect(apiGetMock).toHaveBeenCalled(), {
      timeout: 2000,
    })
    await waitFor(() => expect(form.searchingIndicator).not.toBeInTheDocument())
    expect(toastErrorMock).not.toHaveBeenCalled()
  }, 10000)
})
