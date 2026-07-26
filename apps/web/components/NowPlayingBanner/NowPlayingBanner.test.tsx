import { describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import type { QueueItem } from "@cueball/shared"
import { NowPlayingBannerPageObject } from "../../test/page-objects/NowPlayingBannerPageObject"

function makeItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "q1",
    roomId: "room-1",
    youtubeVideoId: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    thumbnailUrl: "https://img.example/thumb.jpg",
    addedByParticipantId: null,
    score: 0,
    playedAt: null,
    createdAt: new Date().toISOString(),
    votes: [],
    ...overrides,
  }
}

describe("NowPlayingBanner", () => {
  it("renders nothing when there's no current item", () => {
    const banner = new NowPlayingBannerPageObject({ item: null })
    expect(banner.link).not.toBeInTheDocument()
  })

  it("links to the video on YouTube and shows its title", () => {
    const banner = new NowPlayingBannerPageObject({ item: makeItem() })

    expect(banner.link).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    )
    expect(banner.link).toHaveAttribute("target", "_blank")
    expect(screen.getByText("Never Gonna Give You Up")).toBeInTheDocument()
  })

  it("hides the mark-as-played button when the caller can't moderate it", () => {
    const banner = new NowPlayingBannerPageObject({
      item: makeItem(),
      canMarkPlayed: false,
      onMarkPlayed: async () => {},
    })

    expect(banner.markPlayedButton).not.toBeInTheDocument()
  })

  it("lets an authorized viewer mark the current item played", async () => {
    const onMarkPlayed = vi.fn().mockResolvedValue(undefined)
    const banner = new NowPlayingBannerPageObject({
      item: makeItem(),
      canMarkPlayed: true,
      onMarkPlayed,
    })

    await banner.clickMarkPlayed()
    expect(onMarkPlayed).toHaveBeenCalled()
  })

  it("shows a loading state on the mark-as-played button while it's in flight", async () => {
    let resolveMarkPlayed: () => void = () => {}
    const onMarkPlayed = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveMarkPlayed = resolve
        }),
    )
    const banner = new NowPlayingBannerPageObject({
      item: makeItem(),
      canMarkPlayed: true,
      onMarkPlayed,
    })

    const clickPromise = banner.clickMarkPlayed()
    await waitFor(() => expect(banner.markPlayedButton).toBeDisabled())
    expect(screen.getByText(/marking/i)).toBeInTheDocument()

    resolveMarkPlayed()
    await clickPromise
    await waitFor(() => expect(banner.markPlayedButton).not.toBeDisabled())
  })
})
