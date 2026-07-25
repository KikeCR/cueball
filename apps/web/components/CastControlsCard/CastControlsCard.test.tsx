import { beforeEach, describe, expect, it, vi } from "vitest"
import { CastControlsCardPageObject } from "../../test/page-objects/CastControlsCardPageObject"

const sendCastCommandMock = vi.fn()
const connectMock = vi.fn()

let castState: {
  connected: boolean
  deviceName: string | null
  isPlaying: boolean
} | null = null
let castSenderState: {
  supported: boolean
  status: "disconnected" | "connecting" | "connected"
  deviceName: string | null
} = { supported: true, status: "disconnected", deviceName: null }

vi.mock("../../context/RoomContext", () => ({
  useRoom: () => ({ cast: castState, sendCastCommand: sendCastCommandMock }),
}))

vi.mock("../../hooks/useCastSender", () => ({
  useCastSender: () => ({ ...castSenderState, connect: connectMock }),
}))

describe("CastControlsCard", () => {
  beforeEach(() => {
    sendCastCommandMock.mockReset()
    connectMock.mockReset()
    castState = null
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
    castState = { connected: true, deviceName: "Living Room TV", isPlaying: false }
    const card = new CastControlsCardPageObject({ isHost: false })

    expect(await card.findText("Living Room TV")).toBeInTheDocument()

    await card.clickPlayPause()
    expect(sendCastCommandMock).toHaveBeenCalledWith("play")

    await card.clickSkip()
    expect(sendCastCommandMock).toHaveBeenCalledWith("skip")
  })

  it("sends pause when the video is currently playing", async () => {
    castState = { connected: true, deviceName: "Living Room TV", isPlaying: true }
    const card = new CastControlsCardPageObject({ isHost: true })

    await card.clickPlayPause()
    expect(sendCastCommandMock).toHaveBeenCalledWith("pause")
  })
})
