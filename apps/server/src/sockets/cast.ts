import type { Server } from "socket.io"
import {
  DEFAULT_CAST_DEVICE_NAME,
  SocketEvents,
  type ActionError,
  type ActionOk,
  type CastCommandPayload,
  type CastConnectWithCodePayload,
  type CastSessionStartedPayload,
  type CastSessionState,
} from "@cueball/shared"
import {
  clearCastState,
  getCastState,
  setCastState,
} from "../redis/castSession.js"
import {
  clearLoungeSessionState,
  getLoungeSessionState,
  setLoungeSessionState,
} from "../redis/castLoungeSession.js"
import { getRoomState } from "../services/roomService.js"
import { prisma } from "../services/prisma.js"
import {
  addVideoToLoungeQueue,
  bindLoungeSession,
  clearLoungePlaylist,
  pairWithScreenCode,
  seekLoungeTo,
  sendLoungeTransportCommand,
  setLoungePlaylist,
  startLoungeSession,
  type LoungeSessionState,
} from "../services/youtubeLounge.js"
import { broadcastRoomState } from "./broadcast.js"
import { withLoungeLock } from "./loungeLock.js"
import { notifyPlaylistSyncFailed } from "./playlistNotifications.js"
import type { RoomSocket } from "./types.js"

type Ack = (result: ActionOk | ActionError) => void

const LOUNGE_START_FAILURE_MESSAGE =
  "Connected to the TV, but couldn't start playback on it. Try disconnecting and reconnecting."

/**
 * Shared by both ways a TV gets connected — the Cast SDK's MDX handshake
 * (CastSessionStarted, Chromecast-capable browsers only) and manual TV-code
 * pairing (CastConnectWithCode, any device running the YouTube app). Once
 * either has a bound Lounge session, everything from here is identical:
 * load whatever's unplayed into the receiver's own queue and mark the
 * room's cast state connected.
 */
async function bootstrapCastSession(params: {
  io: Server
  roomId: string
  participantId: string
  deviceName: string
  lounge: LoungeSessionState | null
}): Promise<void> {
  const { io, roomId, participantId, deviceName, lounge } = params
  let state: CastSessionState = {
    connected: true,
    deviceName,
    casterParticipantId: participantId,
    isPlaying: false,
    currentQueueItemId: null,
    restarting: false,
  }

  if (lounge) {
    try {
      await withLoungeLock(roomId, async () => {
        const roomState = await getRoomState(roomId)
        const unplayed = roomState?.queue.filter((item) => !item.playedAt) ?? []

        let session = lounge
        const [first, ...rest] = unplayed
        if (first) {
          // setLoungePlaylist replaces whatever the receiver was doing, so
          // this alone already clears out anything left over from a prior
          // session (this room's or another CueBall room's, on the same
          // physical TV).
          session = await setLoungePlaylist(session, first.youtubeVideoId)
          for (const item of rest) {
            session = await addVideoToLoungeQueue(session, item.youtubeVideoId)
          }
          state = { ...state, currentQueueItemId: first.id, isPlaying: true }
        } else {
          // Nothing to play yet, so nothing above would touch the
          // receiver — but it could still have another session's queue
          // loaded (e.g. one that was never cleanly disconnected). Clear
          // it explicitly rather than starting connected in-app while the
          // TV silently keeps playing whatever it already had queued.
          session = await clearLoungePlaylist(session)
        }
        await setLoungeSessionState(roomId, session)
      })
    } catch (err) {
      console.error(
        `Failed to start YouTube lounge session for room ${roomId}`,
        err,
      )
      notifyPlaylistSyncFailed(io, roomId, LOUNGE_START_FAILURE_MESSAGE)
    }
  }

  await setCastState(roomId, state)
  await broadcastRoomState(io, roomId)
}

export function registerCastHandlers(io: Server): void {
  io.on("connection", (socket: RoomSocket) => {
    socket.on(
      SocketEvents.CastSessionStarted,
      (payload: CastSessionStartedPayload, ack?: Ack) => {
        void (async () => {
          const { participantId, roomId } = socket.data
          if (!participantId || !roomId) {
            ack?.({ error: "Join a room first" })
            return
          }

          const participant = await prisma.participant.findUnique({
            where: { id: participantId },
          })
          if (!participant?.isHost) {
            ack?.({ error: "Only the host can connect a TV" })
            return
          }

          // The Cast SDK connection only launches the receiver (which is why
          // the TV opens YouTube on its own) — actually starting playback
          // needs YouTube's separate Lounge API, driven from here using the
          // screenId the browser fetched over the Cast message channel. If
          // that handshake didn't produce a screenId, the TV stays connected
          // but idle rather than failing the whole connection.
          let lounge: LoungeSessionState | null = null
          if (payload.screenId) {
            try {
              lounge = await startLoungeSession(payload.screenId)
            } catch (err) {
              console.error(
                `Failed to start YouTube lounge session for room ${roomId}`,
                err,
              )
              notifyPlaylistSyncFailed(io, roomId, LOUNGE_START_FAILURE_MESSAGE)
            }
          }

          await bootstrapCastSession({
            io,
            roomId,
            participantId,
            deviceName: payload.deviceName,
            lounge,
          })
          ack?.({ ok: true })
        })()
      },
    )

    // The alternative to the Cast SDK for devices with no Cast support at
    // all (Roku, most smart TVs, game consoles) — the host reads a pairing
    // code off the YouTube app's own screen (Settings > "Link with TV
    // code") and types it in here instead of using a browser's device
    // picker. No Cast SDK involved on this end at all, so this works from
    // any browser, including ones useCastSender.ts reports as unsupported.
    socket.on(
      SocketEvents.CastConnectWithCode,
      (payload: CastConnectWithCodePayload, ack?: Ack) => {
        void (async () => {
          const { participantId, roomId } = socket.data
          if (!participantId || !roomId) {
            ack?.({ error: "Join a room first" })
            return
          }

          const participant = await prisma.participant.findUnique({
            where: { id: participantId },
          })
          if (!participant?.isHost) {
            ack?.({ error: "Only the host can connect a TV" })
            return
          }

          const pairingCode = payload.pairingCode?.trim()
          if (!pairingCode) {
            ack?.({ error: "Enter the code shown in the YouTube app" })
            return
          }

          let paired
          try {
            paired = await pairWithScreenCode(pairingCode)
          } catch (err) {
            console.error(
              `Failed to pair with TV code for room ${roomId}`,
              err,
            )
            ack?.({
              error: "Couldn't pair with that code. Double-check it and try again.",
            })
            return
          }

          const lounge = await bindLoungeSession(
            paired.screenId,
            paired.loungeToken,
          )
          await bootstrapCastSession({
            io,
            roomId,
            participantId,
            deviceName: paired.name ?? DEFAULT_CAST_DEVICE_NAME,
            lounge,
          })
          ack?.({ ok: true })
        })()
      },
    )

    socket.on(SocketEvents.CastSessionEnded, (ack?: Ack) => {
      void (async () => {
        const { participantId, roomId } = socket.data
        if (!participantId || !roomId) {
          ack?.({ error: "Join a room first" })
          return
        }

        const participant = await prisma.participant.findUnique({
          where: { id: participantId },
        })
        if (!participant?.isHost) {
          ack?.({ error: "Only the host can end the cast session" })
          return
        }

        // Clear the receiver's own live queue too, not just our
        // bookkeeping — otherwise the physical TV just keeps auto-advancing
        // through this room's leftover queue on its own, and if a
        // DIFFERENT CueBall room connects to the same TV later (same
        // physical device, e.g. via TV-code pairing again), that new
        // room's session can start with the previous room's videos still
        // sitting live on the receiver, playing on their own and never
        // reconciling against the new room's queue.
        try {
          await withLoungeLock(roomId, async () => {
            const lounge = await getLoungeSessionState(roomId)
            if (lounge) await clearLoungePlaylist(lounge)
          })
        } catch (err) {
          console.error(
            `Failed to clear the live Cast session for room ${roomId}`,
            err,
          )
        }

        await clearCastState(roomId)
        await clearLoungeSessionState(roomId)
        ack?.({ ok: true })
        await broadcastRoomState(io, roomId)
      })()
    })

    // Unlike the old pure-broadcast relay, commands now execute directly
    // against YouTube's Lounge API from here — the server holds the live
    // session, so this works regardless of whether the connecting host's
    // browser tab is even still open, and regardless of which connection
    // method (Cast SDK or TV code) established it.
    socket.on(
      SocketEvents.CastCommand,
      (payload: CastCommandPayload, ack?: Ack) => {
        void (async () => {
          const { participantId, roomId } = socket.data
          if (!participantId || !roomId) {
            ack?.({ error: "Join a room first" })
            return
          }

          try {
            const outcome = await withLoungeLock(roomId, async () => {
              const lounge = await getLoungeSessionState(roomId)
              if (!lounge) return { error: "No active cast session" } as const

              let updated: LoungeSessionState | null = null
              if (payload.action === "play") {
                updated = await sendLoungeTransportCommand(lounge, "play")
              } else if (payload.action === "pause") {
                updated = await sendLoungeTransportCommand(lounge, "pause")
              } else if (payload.action === "skip") {
                updated = await sendLoungeTransportCommand(lounge, "next")
              } else if (payload.action === "seek") {
                if (typeof payload.seekSeconds !== "number") {
                  return { error: "Missing seek time" } as const
                }
                updated = await seekLoungeTo(lounge, payload.seekSeconds)
              }
              if (updated) await setLoungeSessionState(roomId, updated)
              return { ok: true } as const
            })

            if ("error" in outcome) {
              ack?.(outcome)
              return
            }

            // isPlaying reflects the command just sent, not something
            // polled — the receiver never reliably reports play/pause state
            // back (see castLoungePolling.ts), so this is the only accurate
            // source for it. "skip" implies the next video starts playing;
            // "seek" doesn't change play/pause state either way.
            if (payload.action === "play" || payload.action === "skip") {
              const cast = await getCastState(roomId)
              if (cast) await setCastState(roomId, { ...cast, isPlaying: true })
              await broadcastRoomState(io, roomId)
            } else if (payload.action === "pause") {
              const cast = await getCastState(roomId)
              if (cast) await setCastState(roomId, { ...cast, isPlaying: false })
              await broadcastRoomState(io, roomId)
            }

            ack?.({ ok: true })
          } catch (err) {
            console.error(`Failed to send cast command for room ${roomId}`, err)
            ack?.({ error: "Couldn't send that command to the TV" })
          }
        })()
      },
    )
  })
}
