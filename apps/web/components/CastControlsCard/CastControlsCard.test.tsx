import { waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { QueueItem } from "@cueball/shared"
import { CastControlsCardPageObject } from "../../test/page-objects/CastControlsCardPageObject"

const sendCastCommandMock = vi.fn()
const connectMock = vi.fn()
const disconnectMock = vi.fn()
const toastErrorMock = vi.fn()

let castState: {
  connected: boolean
  deviceName: string | null
  isPlaying: boolean
  currentQueueItemId: string | null
} | null = null
let queueState: QueueItem[] = []
let castSenderState: {
  supported: boolean
  status: "disconnected" | "connecting" | "connected"
  deviceName: string | null
} = { supported: true, status: "disconnected", deviceName: null }

vi.mock("../../context/RoomContext", () => ({
  useRoom: () => ({
    cast: castState,
    queue: queueState,
    sendCastCommand: sendCastCommandMock,
  }),
}))

vi.mock("../../context/ToastContext", () => ({
  useToast: () => ({ error: toastErrorMock, success: vi.fn() }),
}))

vi.mock("../../hooks/useCastSender", () => ({
  useCastSender: () => ({
    ...castSenderState,
    connect: connectMock,
    disconnect: disconnectMock,
  }),
}))

function makeQueueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "item-1",
    roomId: "room-1",
    youtubeVideoId: "abc123",
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

describe("CastControlsCard", () => {
  beforeEach(() => {
    sendCastCommandMock.mockReset()
    connectMock.mockReset()
    disconnectMock.mockReset()
    toastErrorMock.mockReset()
    sendCastCommandMock.mockResolvedValue(undefined)
    castState = null
    queueState = []
    castSenderState = { supported: true, status: "disconnected", deviceName: null }
  })

  it("tells a non-host participant to wait when nothing is connected", async () => {
    const card = new CastControlsCardPageObject({ isHost: false })
    expect(
      await card.findText("Waiting for the host to connect a TV."),
    ).toBeInTheDocument()
  })

  it("lets the host connect to a TV", async () => {
    const card = new CastControlsCardPageObject({ isHost: true })
    await card.clickConnect()
    expect(connectMock).toHaveBeenCalled()
  })

  it("disables connecting and explains why when the browser can't cast", async () => {
    castSenderState = { supported: false, status: "disconnected", deviceName: null }
    const card = new CastControlsCardPageObject({ isHost: true })
    expect(card.connectButton).toBeDisabled()
    expect(
      await card.findText("Casting requires Chrome on desktop or Android."),
    ).toBeInTheDocument()
  })

  it("shows transport controls and the device name once connected", async () => {
    castState = {
      connected: true,
      deviceName: "Living Room TV",
      isPlaying: false,
      currentQueueItemId: null,
    }
    const card = new CastControlsCardPageObject({ isHost: false })

    expect(await card.findText("Living Room TV")).toBeInTheDocument()

    await card.clickPlayPause()
    expect(sendCastCommandMock).toHaveBeenCalledWith("play")

    await card.clickSkip()
    expect(sendCastCommandMock).toHaveBeenCalledWith("skip")
  })

  it("sends pause when the video is currently playing", async () => {
    castState = {
      connected: true,
      deviceName: "Living Room TV",
      isPlaying: true,
      currentQueueItemId: null,
    }
    const card = new CastControlsCardPageObject({ isHost: true })

    await card.clickPlayPause()
    expect(sendCastCommandMock).toHaveBeenCalledWith("pause")
  })

  it("shows a pending state on the play/pause button while the command is in flight", async () => {
    let resolveCommand: () => void = () => {}
    sendCastCommandMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveCommand = resolve
      }),
    )
    castState = {
      connected: true,
      deviceName: "Living Room TV",
      isPlaying: false,
      currentQueueItemId: null,
    }
    const card = new CastControlsCardPageObject({ isHost: true })

    const clickPromise = card.clickPlayPause()
    await waitFor(() => expect(card.playPauseButton).toBeDisabled())

    resolveCommand()
    await clickPromise
    await waitFor(() => expect(card.playPauseButton).not.toBeDisabled())
  })

  it("toasts an error when a command fails", async () => {
    sendCastCommandMock.mockRejectedValue(new Error("Couldn't reach the TV"))
    castState = {
      connected: true,
      deviceName: "Living Room TV",
      isPlaying: false,
      currentQueueItemId: null,
    }
    const card = new CastControlsCardPageObject({ isHost: true })

    await card.clickPlayPause()
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith("Couldn't reach the TV"),
    )
  })

  it("shows the now-playing title and thumbnail for the loaded queue item", async () => {
    castState = {
      connected: true,
      deviceName: "Living Room TV",
      isPlaying: true,
      currentQueueItemId: "item-1",
    }
    queueState = [makeQueueItem()]
    const card = new CastControlsCardPageObject({ isHost: true })

    expect(
      await card.findText("Never Gonna Give You Up"),
    ).toBeInTheDocument()
  })

  it("lets the host disconnect, and hides that control from other participants", async () => {
    castState = {
      connected: true,
      deviceName: "Living Room TV",
      isPlaying: false,
      currentQueueItemId: null,
    }
    const hostCard = new CastControlsCardPageObject({ isHost: true })
    await hostCard.clickDisconnect()
    expect(disconnectMock).toHaveBeenCalled()
  })

  it("does not show a disconnect control to non-host participants", () => {
    castState = {
      connected: true,
      deviceName: "Living Room TV",
      isPlaying: false,
      currentQueueItemId: null,
    }
    const guestCard = new CastControlsCardPageObject({ isHost: false })
    expect(guestCard.queryDisconnectButton()).not.toBeInTheDocument()
  })
})
