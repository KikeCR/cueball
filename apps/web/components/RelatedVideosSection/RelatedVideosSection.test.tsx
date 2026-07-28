import { waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RelatedVideosSectionPageObject } from "../../test/page-objects/RelatedVideosSectionPageObject"

const fetchRelatedVideosMock = vi.fn()
const addToQueueMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock("../../context/RoomContext", () => ({
  useRoom: () => ({
    fetchRelatedVideos: fetchRelatedVideosMock,
    addToQueue: addToQueueMock,
  }),
}))

vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({ success: toastSuccessMock, error: toastErrorMock }),
}))

const sampleResults = [
  {
    videoId: "abc123",
    title: "Some Song",
    thumbnailUrl: null,
    channelTitle: "Some Channel",
  },
  {
    videoId: "def456",
    title: "Another Song",
    thumbnailUrl: null,
    channelTitle: "Another Channel",
  },
]

describe("RelatedVideosSection", () => {
  beforeEach(() => {
    fetchRelatedVideosMock.mockReset()
    addToQueueMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
  })

  it("shows a prompt before the first refresh, not results or an empty state", () => {
    const section = new RelatedVideosSectionPageObject()
    expect(section.emptyPromptText).toBeInTheDocument()
    expect(section.noResultsText).not.toBeInTheDocument()
  })

  it("fetches and shows results only when refresh is clicked", async () => {
    fetchRelatedVideosMock.mockResolvedValue(sampleResults)
    const section = new RelatedVideosSectionPageObject()

    expect(fetchRelatedVideosMock).not.toHaveBeenCalled()

    await section.clickRefresh()

    expect(fetchRelatedVideosMock).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(section.queryResultButton("Some Song")).toBeInTheDocument(),
    )
    expect(section.queryResultButton("Another Song")).toBeInTheDocument()
  })

  it("shows a no-results message after refreshing to an empty list", async () => {
    fetchRelatedVideosMock.mockResolvedValue([])
    const section = new RelatedVideosSectionPageObject()

    await section.clickRefresh()

    await waitFor(() => expect(section.noResultsText).toBeInTheDocument())
    expect(section.emptyPromptText).not.toBeInTheDocument()
  })

  it("toasts an error when the refresh fails", async () => {
    fetchRelatedVideosMock.mockRejectedValue(
      new Error("Related videos aren't enabled for this room"),
    )
    const section = new RelatedVideosSectionPageObject()

    await section.clickRefresh()

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Related videos aren't enabled for this room",
      ),
    )
  })

  it("adds a result to the queue and removes it from the list on success", async () => {
    fetchRelatedVideosMock.mockResolvedValue(sampleResults)
    addToQueueMock.mockResolvedValue(undefined)
    const section = new RelatedVideosSectionPageObject()

    await section.clickRefresh()
    await waitFor(() =>
      expect(section.queryResultButton("Some Song")).toBeInTheDocument(),
    )

    await section.clickResult("Some Song")

    expect(addToQueueMock).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=abc123",
    )
    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith("Added to queue"),
    )
    expect(section.queryResultButton("Some Song")).not.toBeInTheDocument()
    // The other suggestion wasn't touched, so it stays in the list.
    expect(section.queryResultButton("Another Song")).toBeInTheDocument()
  })

  it("toasts an error and keeps the result when adding fails", async () => {
    fetchRelatedVideosMock.mockResolvedValue(sampleResults)
    addToQueueMock.mockRejectedValue(new Error("That video is already in the queue"))
    const section = new RelatedVideosSectionPageObject()

    await section.clickRefresh()
    await waitFor(() =>
      expect(section.queryResultButton("Some Song")).toBeInTheDocument(),
    )

    await section.clickResult("Some Song")

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "That video is already in the queue",
      ),
    )
    expect(section.queryResultButton("Some Song")).toBeInTheDocument()
  })
})
