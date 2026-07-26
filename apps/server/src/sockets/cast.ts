import type { Server } from "socket.io"
import {
  SocketEvents,
  type ActionError,
  type ActionOk,
  type CastCommandPayload,
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
  seekLoungeTo,
  sendLoungeTransportCommand,
  setLoungePlaylist,
  startLoungeSession,
  type LoungeSessionState,
} from "../services/youtubeLounge.js"
import { broadcastRoomState } from "./broadcast.js"
import { notifyPlaylistSyncFailed } from "./playlistNotifications.js"
import type { RoomSocket } from "./types.js"

type Ack = (result: ActionOk | ActionError) => void

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

          let state: CastSessionState = {
            connected: true,
            deviceName: payload.deviceName,
            casterParticipantId: participantId,
            isPlaying: false,
            currentQueueItemId: null,
          }

          // The Cast SDK connection only launches the receiver (which is why
          // the TV opens YouTube on its own) — actually starting playback
          // needs YouTube's separate Lounge API, driven from here using the
          // screenId the browser fetched over the Cast message channel. If
          // that handshake didn't produce a screenId, the TV stays connected
          // but idle rather than failing the whole connection.
          if (payload.screenId) {
            try {
              const roomState = await getRoomState(roomId)
              const unplayed =
                roomState?.queue.filter((item) => !item.playedAt) ?? []

              let lounge = await startLoungeSession(payload.screenId)
              const [first, ...rest] = unplayed
              if (first) {
                lounge = await setLoungePlaylist(lounge, first.youtubeVideoId)
                for (const item of rest) {
                  lounge = await addVideoToLoungeQueue(lounge, item.youtubeVideoId)
                }
                state = {
                  ...state,
                  currentQueueItemId: first.id,
                  isPlaying: true,
                }
              }
              await setLoungeSessionState(roomId, lounge)
            } catch (err) {
              console.error(
                `Failed to start YouTube lounge session for room ${roomId}`,
                err,
              )
              notifyPlaylistSyncFailed(
                io,
                roomId,
                "Connected to the TV, but couldn't start playback on it. Try disconnecting and reconnecting.",
              )
            }
          }

          await setCastState(roomId, state)
          ack?.({ ok: true })
          await broadcastRoomState(io, roomId)
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

        await clearCastState(roomId)
        await clearLoungeSessionState(roomId)
        ack?.({ ok: true })
        await broadcastRoomState(io, roomId)
      })()
    })

    // Unlike the old pure-broadcast relay, commands now execute directly
    // against YouTube's Lounge API from here — the server holds the live
    // session, so this works regardless of whether the connecting host's
    // browser tab is even still open.
    socket.on(
      SocketEvents.CastCommand,
      (payload: CastCommandPayload, ack?: Ack) => {
        void (async () => {
          const { participantId, roomId } = socket.data
          if (!participantId || !roomId) {
            ack?.({ error: "Join a room first" })
            return
          }

          const lounge = await getLoungeSessionState(roomId)
          if (!lounge) {
            ack?.({ error: "No active cast session" })
            return
          }

          try {
            let updated: LoungeSessionState | null = null
            if (payload.action === "play") {
              updated = await sendLoungeTransportCommand(lounge, "play")
            } else if (payload.action === "pause") {
              updated = await sendLoungeTransportCommand(lounge, "pause")
            } else if (payload.action === "skip") {
              updated = await sendLoungeTransportCommand(lounge, "next")
            } else if (payload.action === "seek") {
              if (typeof payload.seekSeconds !== "number") {
                ack?.({ error: "Missing seek time" })
                return
              }
              updated = await seekLoungeTo(lounge, payload.seekSeconds)
            }
            if (updated) await setLoungeSessionState(roomId, updated)

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
