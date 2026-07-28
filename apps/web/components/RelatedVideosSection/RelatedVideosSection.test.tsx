import { waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { YoutubeSearchResult } from "@cueball/shared"
import { RelatedVideosSectionPageObject } from "../../test/page-objects/RelatedVideosSectionPageObject"

const fetchRelatedVideosMock = vi.fn()
const addToQueueMock = vi.fn()
const toastSuccessMock = vi.fn()
const toastErrorMock = vi.fn()
let mockRelatedVideos: YoutubeSearchResult[] = []

vi.mock("../../context/RoomContext", () => ({
  useRoom: () => ({
    relatedVideos: mockRelatedVideos,
    fetchRelatedVideos: fetchRelatedVideosMock,
    addToQueue: addToQueueMock,
  }),
}))

vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({ success: toastSuccessMock, error: toastErrorMock }),
}))

const sampleResults: YoutubeSearchResult[] = [
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
    mockRelatedVideos = []
  })

  it("shows an empty-state message when there are no related videos yet", () => {
    const section = new RelatedVideosSectionPageObject()
    expect(section.emptyStateText).toBeInTheDocument()
  })

  it("triggers a refresh without directly returning results — the shared list updates via room state", async () => {
    fetchRelatedVideosMock.mockResolvedValue(undefined)
    const section = new RelatedVideosSectionPageObject()

    await section.clickRefresh()

    expect(fetchRelatedVideosMock).toHaveBeenCalledTimes(1)
    expect(fetchRelatedVideosMock).toHaveBeenCalledWith()
  })

  it("shows whatever is currently in the shared related-videos list", async () => {
    mockRelatedVideos = sampleResults
    fetchRelatedVideosMock.mockImplementation(async () => {})
    const section = new RelatedVideosSectionPageObject()

    await section.clickRefresh()

    await waitFor(() =>
      expect(section.queryResultButton("Some Song")).toBeInTheDocument(),
    )
    expect(section.queryResultButton("Another Song")).toBeInTheDocument()
    expect(section.emptyStateText).not.toBeInTheDocument()
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

  it("adds a result to the queue and toasts success", async () => {
    mockRelatedVideos = sampleResults
    addToQueueMock.mockResolvedValue(undefined)
    const section = new RelatedVideosSectionPageObject()

    await section.clickResult("Some Song")

    expect(addToQueueMock).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=abc123",
    )
    await waitFor(() =>
      expect(toastSuccessMock).toHaveBeenCalledWith("Added to queue"),
    )
  })

  it("toasts an error when adding fails", async () => {
    mockRelatedVideos = sampleResults
    addToQueueMock.mockRejectedValue(new Error("That video is already in the queue"))
    const section = new RelatedVideosSectionPageObject()

    await section.clickResult("Some Song")

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "That video is already in the queue",
      ),
    )
  })
})
