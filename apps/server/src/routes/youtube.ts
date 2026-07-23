import { Router } from "express"
import { asyncHandler } from "../lib/asyncHandler.js"
import { getIo } from "../realtime.js"
import { prisma } from "../services/prisma.js"
import {
  signYoutubeOAuthState,
  verifyParticipantToken,
  verifyYoutubeOAuthState,
} from "../services/tokens.js"
import {
  exchangeCodeForTokens,
  getConsentUrl,
  isYoutubeOAuthConfigured,
} from "../services/youtubeAuth.js"
import { createPlaylistForRoom } from "../services/youtubePlaylist.js"
import { broadcastRoomState } from "../sockets/broadcast.js"

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000"

export const youtubeRouter = Router()

youtubeRouter.get(
  "/rooms/:roomId/youtube/connect",
  asyncHandler(async (req, res) => {
    const roomId = req.params.roomId
    if (!roomId) {
      res.status(400).json({ error: "roomId is required" })
      return
    }

    if (!isYoutubeOAuthConfigured()) {
      res
        .status(503)
        .json({ error: "YouTube integration is not configured on this server" })
      return
    }

    const token =
      typeof req.query.token === "string" ? req.query.token : undefined
    const decoded = token ? verifyParticipantToken(token) : null
    if (!decoded || decoded.roomId !== roomId) {
      res.status(401).json({ error: "Invalid or missing participant token" })
      return
    }

    const participant = await prisma.participant.findUnique({
      where: { id: decoded.participantId },
    })
    if (!participant?.isHost) {
      res.status(403).json({ error: "Only the host can connect YouTube" })
      return
    }

    res.redirect(getConsentUrl(signYoutubeOAuthState(roomId)))
  }),
)

youtubeRouter.get(
  "/youtube/callback",
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined
    const state =
      typeof req.query.state === "string" ? req.query.state : undefined
    const decoded = state ? verifyYoutubeOAuthState(state) : null

    if (!code || !decoded) {
      res.status(400).send("Invalid YouTube authorization response.")
      return
    }

    const room = await prisma.room.findUnique({ where: { id: decoded.roomId } })
    if (!room) {
      res.status(404).send("Room not found.")
      return
    }

    const tokens = await exchangeCodeForTokens(code)
    const connectedRoom = await prisma.room.update({
      where: { id: room.id },
      data: {
        youtubeAccessToken: tokens.accessToken,
        youtubeRefreshToken: tokens.refreshToken,
        youtubeTokenExpiresAt: tokens.expiresAt,
      },
    })

    await createPlaylistForRoom(connectedRoom)

    const io = getIo()
    if (io) await broadcastRoomState(io, room.id)

    res.redirect(`${CLIENT_ORIGIN}/room/${room.code}?youtubeConnected=1`)
  }),
)
