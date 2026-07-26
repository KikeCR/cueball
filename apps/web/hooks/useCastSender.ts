"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  SocketEvents,
  type ActionError,
  type CastAdvanceResult,
  type CastCommandPayload,
} from "@cueball/shared"
import { useRoom } from "../context/RoomContext"
import { useToast } from "../context/ToastContext"

const CAST_SENDER_SCRIPT_SRC =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js"

// The same Cast receiver app ID youtube.com's own Cast button targets, so
// the TV gets the real native YouTube experience with no receiver of our
// own to build or host. This isn't a documented public API — the LOAD
// payload shape below (customData.videoId) is reverse-engineered convention
// from community Cast-to-YouTube tools, not a Google contract, and needs
// verification against a real Chromecast.
const YOUTUBE_RECEIVER_APP_ID = "233637DE"

export type CastConnectionStatus = "disconnected" | "connecting" | "connected"

interface UseCastSenderResult {
  /** False until the Cast Sender SDK reports this browser can cast (Chrome desktop/Android only). */
  supported: boolean
  status: CastConnectionStatus
  deviceName: string | null
  connect: () => Promise<void>
  disconnect: () => void
}

function describeCastErrorCode(code: string): string {
  switch (code) {
    case "cancel":
      return "Cast device selection was cancelled."
    case "timeout":
      return "Timed out looking for a Cast device."
    case "receiver_unavailable":
      return "No Cast devices found — make sure the TV and this device are on the same Wi-Fi network."
    case "extension_missing":
    case "extension_not_compatible":
      return "This browser's Cast support isn't available right now."
    case "session_error":
    case "channel_error":
      return "Couldn't establish a connection with the Cast device."
    default:
      return "Couldn't connect to that Cast device."
  }
}

/**
 * The only module that touches window.cast/chrome.cast. Only does anything
 * for the host of a cast-mode room — everyone else's play/pause/skip taps
 * are just socket emits relayed through the server (see RoomContext's
 * sendCastCommand) to whichever browser this hook is active in.
 */
export function useCastSender(): UseCastSenderResult {
  const { socket, room, self, cast, queue } = useRoom()
  // Destructured because useToast()'s returned object is a fresh reference
  // on every toast anywhere in the app (its provider re-renders when the
  // toast list changes) — the individual functions are stable, the wrapper
  // isn't, and several effects below depend on these identities.
  const { success: toastSuccess, error: toastError } = useToast()
  const [supported, setSupported] = useState(false)
  const [status, setStatus] = useState<CastConnectionStatus>("disconnected")
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const playerRef = useRef<cast.framework.RemotePlayer | null>(null)
  const controllerRef = useRef<cast.framework.RemotePlayerController | null>(
    null,
  )
  const currentQueueItemIdRef = useRef<string | null>(null)
  currentQueueItemIdRef.current = cast?.currentQueueItemId ?? null
  const advancingRef = useRef(false)

  const isHostCasting = room?.mode === "cast" && Boolean(self?.isHost)

  const loadVideo = useCallback((videoId: string) => {
    const session = window.cast?.framework.CastContext.getInstance().getCurrentSession()
    if (!session) return
    const mediaInfo = new chrome.cast.media.MediaInfo(videoId, "video/mp4")
    mediaInfo.streamType = chrome.cast.media.StreamType.BUFFERED
    mediaInfo.metadata = new chrome.cast.media.GenericMediaMetadata()
    const request = new chrome.cast.media.LoadRequest(mediaInfo)
    request.customData = { videoId }
    void session.loadMedia(request)
  }, [])

  // Shared by a fresh connect() and by auto-resuming a session that
  // survived a page refresh (see resumeSavedSession below) — both land in
  // the same "tell the server a session is live" place.
  const announceSessionStarted = useCallback(
    (name: string) => {
      setDeviceName(name)
      setStatus("connected")
      toastSuccess(`Connected to ${name}`)
      socket?.emit(SocketEvents.CastSessionStarted, { deviceName: name }, () => {})
    },
    [socket, toastSuccess],
  )

  const advance = useCallback(() => {
    if (!socket || advancingRef.current) return
    advancingRef.current = true
    socket.emit(
      SocketEvents.CastAdvance,
      (result: CastAdvanceResult | ActionError) => {
        advancingRef.current = false
        if ("error" in result) return
        if (result.nextYoutubeVideoId) loadVideo(result.nextYoutubeVideoId)
      },
    )
  }, [socket, loadVideo])

  // Nothing plays until something is loaded: kick off the first item as
  // soon as the session connects, and pick up again if the queue was empty
  // at connect time and a video gets added while still idle.
  useEffect(() => {
    if (!isHostCasting || !cast?.connected || cast.currentQueueItemId) return
    if (queue.some((item) => !item.playedAt)) advance()
  }, [isHostCasting, cast?.connected, cast?.currentQueueItemId, queue, advance])

  // Load the Cast Sender SDK script, only for the host of a cast-mode room.
  // This SDK does a one-time async handshake with the browser's own Cast
  // component to populate window.cast — it's a page-global bootstrap, not
  // something scoped to this component's lifecycle, so once requested it
  // must be left alone. Tearing the <script> tag down and re-adding it (e.g.
  // in a cleanup keyed to isHostCasting, which can flip transiently during
  // room-state hydration) interrupts that handshake and leaves window.cast
  // permanently undefined even on browsers where Casting genuinely works.
  useEffect(() => {
    if (!isHostCasting) return
    if (window.cast?.framework) {
      setSupported(true)
      return
    }

    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      // Some browsers report the script as "available" without actually
      // populating window.cast (e.g. Chrome builds without native Cast
      // support) — trust the actual object, not just the flag.
      setSupported(isAvailable && Boolean(window.cast?.framework))
    }

    if (document.querySelector(`script[src="${CAST_SENDER_SCRIPT_SRC}"]`)) return
    const script = document.createElement("script")
    script.src = CAST_SENDER_SCRIPT_SRC
    document.head.appendChild(script)
  }, [isHostCasting])

  // Once the SDK is available, configure the YouTube receiver app and set
  // up the player/controller this hook drives for the rest of its life.
  useEffect(() => {
    if (!supported || !isHostCasting) return
    // `supported` can lag a beat behind window.cast actually being fully
    // populated (SDK callback timing varies by browser) — re-check here
    // rather than trust the flag alone.
    if (!window.cast?.framework) {
      setSupported(false)
      return
    }
    const context = window.cast.framework.CastContext.getInstance()
    context.setOptions({
      receiverApplicationId: YOUTUBE_RECEIVER_APP_ID,
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      // Lets the SDK silently reattach to a still-live session after a page
      // refresh, instead of the host having to reconnect from scratch.
      resumeSavedSession: true,
    })

    const player = new window.cast.framework.RemotePlayer()
    const controller = new window.cast.framework.RemotePlayerController(
      player,
    )
    playerRef.current = player
    controllerRef.current = controller

    const handleConnectedChanged = () => {
      setStatus(player.isConnected ? "connected" : "disconnected")
      if (!player.isConnected) setDeviceName(null)
    }

    const handlePlayerStateChanged = () => {
      if (!socket || !player.isConnected) return

      if (player.playerState === chrome.cast.media.PlayerState.IDLE) {
        const idleReason = context.getCurrentSession()?.getMediaSession()
          ?.idleReason
        if (idleReason === chrome.cast.media.IdleReason.FINISHED) {
          advance()
          return
        }
      }

      socket.emit(SocketEvents.CastStateReport, {
        isPlaying: player.playerState === chrome.cast.media.PlayerState.PLAYING,
        currentQueueItemId: currentQueueItemIdRef.current,
        currentTimeSeconds: player.currentTime,
        durationSeconds: player.duration,
      })
    }

    controller.addEventListener(
      window.cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
      handleConnectedChanged,
    )
    controller.addEventListener(
      window.cast.framework.RemotePlayerEventType.PLAYER_STATE_CHANGED,
      handlePlayerStateChanged,
    )

    // Play/pause changes report immediately via the listener above; this
    // just keeps the scrubber ticking forward in between those events.
    const progressInterval = window.setInterval(() => {
      if (!socket || !player.isConnected || !player.isMediaLoaded) return
      socket.emit(SocketEvents.CastStateReport, {
        isPlaying: player.playerState === chrome.cast.media.PlayerState.PLAYING,
        currentQueueItemId: currentQueueItemIdRef.current,
        currentTimeSeconds: player.currentTime,
        durationSeconds: player.duration,
      })
    }, 1000)

    // A page refresh always drops the old socket for real (the server has
    // no way to tell "host reloaded" from "host left"), but the Cast SDK
    // itself may have silently reattached to the still-live session via
    // resumeSavedSession above — if so, re-announce it so the server's
    // view of the room catches back up.
    if (player.isConnected) {
      const name = context.getCurrentSession()?.getCastDevice().friendlyName ?? "TV"
      announceSessionStarted(name)
    }

    return () => {
      window.clearInterval(progressInterval)
      controller.removeEventListener(
        window.cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
        handleConnectedChanged,
      )
      controller.removeEventListener(
        window.cast.framework.RemotePlayerEventType.PLAYER_STATE_CHANGED,
        handlePlayerStateChanged,
      )
    }
  }, [supported, isHostCasting, socket, advance, announceSessionStarted])

  // Relayed commands from any participant land here; only the browser
  // actually holding the live session (this one, once connected) acts.
  useEffect(() => {
    if (!socket || !isHostCasting) return

    const handleCommand = (payload: CastCommandPayload) => {
      const player = playerRef.current
      const controller = controllerRef.current
      if (!player?.isConnected || !controller) return

      switch (payload.action) {
        case "play":
          if (player.isPaused) controller.playOrPause()
          break
        case "pause":
          if (!player.isPaused) controller.playOrPause()
          break
        case "seek":
          if (typeof payload.seekSeconds === "number") {
            player.currentTime = payload.seekSeconds
            controller.seek()
          }
          break
        case "skip":
          advance()
          break
      }
    }

    socket.on(SocketEvents.CastCommand, handleCommand)
    return () => {
      socket.off(SocketEvents.CastCommand, handleCommand)
    }
  }, [socket, isHostCasting, advance])

  const connect = useCallback(async () => {
    if (!supported || !socket || !window.cast?.framework) return
    setStatus("connecting")
    try {
      const errorCode = await window.cast.framework.CastContext.getInstance().requestSession()
      if (errorCode) {
        setStatus("disconnected")
        toastError(describeCastErrorCode(errorCode))
        return
      }
      const session = window.cast.framework.CastContext.getInstance().getCurrentSession()
      const name = session?.getCastDevice().friendlyName ?? "TV"
      announceSessionStarted(name)
    } catch (err) {
      setStatus("disconnected")
      toastError(
        describeCastErrorCode(
          typeof err === "string" ? err : String((err as { code?: string })?.code ?? err),
        ),
      )
    }
  }, [supported, socket, announceSessionStarted, toastError])

  const disconnect = useCallback(() => {
    window.cast?.framework.CastContext.getInstance().endCurrentSession(true)
    setStatus("disconnected")
    setDeviceName(null)
    toastSuccess("Disconnected from TV")
    socket?.emit(SocketEvents.CastSessionEnded, () => {})
  }, [socket, toastSuccess])

  return { supported, status, deviceName, connect, disconnect }
}
