"use client"

import { useCallback, useEffect, useState } from "react"
import {
  CAST_MODE,
  DEFAULT_CAST_DEVICE_NAME,
  SocketEvents,
  type ActionError,
  type ActionOk,
} from "@cueball/shared"
import { useRoom } from "../context/RoomContext"
import { useToast } from "../context/ToastContext"

// The bootstrap script only loads cast_framework.js — which defines
// window.cast/cast.framework, everything below actually depends on — when
// its own <script> URL carries this exact query param. Without it, the
// script silently sets up only the legacy chrome.cast namespace and never
// fetches the framework layer, leaving window.cast permanently undefined
// even though __onGCastApiAvailable reports isAvailable=true. Confirmed by
// reading the shipped source at this URL directly.
const CAST_SENDER_SCRIPT_SRC =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1"
const YOUTUBE_RECEIVER_APP_ID = "233637DE"

// The custom Cast message channel YouTube's receiver uses to hand back a
// "screen id" — everything about actually driving playback (see
// apps/server/src/services/youtubeLounge.ts) happens server-side from that
// id via YouTube's separate, undocumented Lounge API, not through this Cast
// session at all. This handshake is the only reason the browser still needs
// to touch the Cast SDK's media/message plumbing.
const MDX_NAMESPACE = "urn:x-cast:com.google.youtube.mdx"
const SCREEN_ID_TIMEOUT_MS = 4000

function fetchScreenId(
  session: cast.framework.CastSession,
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      session.removeMessageListener(MDX_NAMESPACE, listener)
      resolve(value)
    }
    const listener = (_namespace: string, message: string) => {
      try {
        const parsed = JSON.parse(message) as {
          type?: string
          data?: { screenId?: string }
        }
        if (parsed.type === "mdxSessionStatus" && parsed.data?.screenId) {
          finish(parsed.data.screenId)
        }
      } catch {
        // Not the message we're waiting for — ignore.
      }
    }
    session.addMessageListener(MDX_NAMESPACE, listener)
    session
      .sendMessage(MDX_NAMESPACE, { type: "getMdxSessionStatus" })
      .catch(() => finish(null))
    window.setTimeout(() => finish(null), SCREEN_ID_TIMEOUT_MS)
  })
}

export type CastConnectionStatus = "disconnected" | "connecting" | "connected"

interface UseCastSenderResult {
  /** False until the Cast Sender SDK reports this browser can cast (Chrome desktop/Android only). */
  supported: boolean
  status: CastConnectionStatus
  deviceName: string | null
  connect: () => Promise<void>
  /** Pairs with any device running the YouTube app (Roku, most smart TVs, game consoles, and — unlike `connect` — any browser, including iOS) via a manual on-screen code. */
  connectWithCode: (pairingCode: string) => Promise<void>
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
 * for the host of a cast-mode room. Playback control (play/pause/skip/seek,
 * from any participant) and status reporting are both driven server-side
 * once connected (see sockets/cast.ts and sockets/castLoungePolling.ts) —
 * this hook's job ends at establishing the Cast session and handing the
 * server a screenId to take over with.
 */
export function useCastSender(): UseCastSenderResult {
  const { socket, room, self } = useRoom()
  // Destructured because useToast()'s returned object is a fresh reference
  // on every toast anywhere in the app (its provider re-renders when the
  // toast list changes) — the individual functions are stable, the wrapper
  // isn't, and several effects below depend on these identities.
  const { success: toastSuccess, error: toastError } = useToast()
  const [supported, setSupported] = useState(false)
  const [status, setStatus] = useState<CastConnectionStatus>("disconnected")
  const [deviceName, setDeviceName] = useState<string | null>(null)

  const isHostCasting = room?.mode === CAST_MODE && Boolean(self?.isHost)

  // Shared by a fresh connect() and by auto-resuming a session that
  // survived a page refresh (see resumeSavedSession below) — both land in
  // the same "tell the server a session is live" place.
  const announceSessionStarted = useCallback(
    (name: string, screenId: string | null) => {
      setDeviceName(name)
      setStatus("connected")
      toastSuccess(`Connected to ${name}`)
      socket?.emit(
        SocketEvents.CastSessionStarted,
        { deviceName: name, screenId },
        () => {},
      )
    },
    [socket, toastSuccess],
  )

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

  // Once the SDK is available, configure the YouTube receiver app and track
  // connection status for the rest of this hook's life. Playback itself
  // isn't driven from here (see the module doc comment above).
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
    const controller = new window.cast.framework.RemotePlayerController(player)

    const handleConnectedChanged = () => {
      setStatus(player.isConnected ? "connected" : "disconnected")
      if (!player.isConnected) setDeviceName(null)
    }

    controller.addEventListener(
      window.cast.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
      handleConnectedChanged,
    )

    // A page refresh always drops the old socket for real (the server has
    // no way to tell "host reloaded" from "host left"), but the Cast SDK
    // itself may have silently reattached to the still-live session via
    // resumeSavedSession above — if so, re-announce it (and re-fetch the
    // screenId) so the server's view of the room catches back up.
    if (player.isConnected) {
      const session = context.getCurrentSession()
      const name = session?.getCastDevice().friendlyName ?? "TV"
      if (session) {
        void fetchScreenId(session).then((screenId) =>
          announceSessionStarted(name, screenId),
        )
      } else {
        announceSessionStarted(name, null)
      }
    }

    return () => {
      controller.removeEventListener(
        window.cast!.framework.RemotePlayerEventType.IS_CONNECTED_CHANGED,
        handleConnectedChanged,
      )
    }
  }, [supported, isHostCasting, announceSessionStarted])

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
      const name = session?.getCastDevice().friendlyName ?? DEFAULT_CAST_DEVICE_NAME
      const screenId = session ? await fetchScreenId(session) : null
      announceSessionStarted(name, screenId)
    } catch (err) {
      setStatus("disconnected")
      toastError(
        describeCastErrorCode(
          typeof err === "string" ? err : String((err as { code?: string })?.code ?? err),
        ),
      )
    }
  }, [supported, socket, announceSessionStarted, toastError])

  // No Cast SDK involved at all — this works from any browser (including
  // iOS, where connect() above can never work) by exchanging a code the
  // YouTube app shows on its own screen for a Lounge session, entirely
  // server-side (see sockets/cast.ts's CastConnectWithCode handler).
  const connectWithCode = useCallback(
    async (pairingCode: string) => {
      if (!socket) return
      setStatus("connecting")
      try {
        await new Promise<void>((resolve, reject) => {
          socket.emit(
            SocketEvents.CastConnectWithCode,
            { pairingCode },
            (result: ActionOk | ActionError) => {
              if ("error" in result) reject(new Error(result.error))
              else resolve()
            },
          )
        })
        setStatus("connected")
        toastSuccess("Connected to TV")
      } catch (err) {
        setStatus("disconnected")
        toastError(
          err instanceof Error ? err.message : "Couldn't connect with that code",
        )
        throw err
      }
    },
    [socket, toastSuccess, toastError],
  )

  const disconnect = useCallback(() => {
    window.cast?.framework.CastContext.getInstance().endCurrentSession(true)
    setStatus("disconnected")
    setDeviceName(null)
    toastSuccess("Disconnected from TV")
    socket?.emit(SocketEvents.CastSessionEnded, () => {})
  }, [socket, toastSuccess])

  return { supported, status, deviceName, connect, connectWithCode, disconnect }
}
