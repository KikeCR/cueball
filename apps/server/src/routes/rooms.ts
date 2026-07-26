import { Router } from "express"
import {
  CAST_MODE,
  MAX_NAME_LENGTH,
  MAX_ROOM_NAME_LENGTH,
  PLAYLIST_MODE,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type RoomMode,
  type RoomPreview,
} from "@cueball/shared"
import { asyncHandler } from "../lib/asyncHandler.js"
import { optionalAuth, requireAuth } from "../middleware/auth.js"
import { userHasBetaFeaturesEnabled } from "../services/authService.js"
import {
  commitRoomDeletion,
  createRoomWithHost,
  findDeletableRoom,
  getRoomByCode,
} from "../services/roomService.js"
import { serializeParticipant, serializeRoom } from "../services/serializers.js"
import { signParticipantToken } from "../services/tokens.js"
import { revokeYoutubeAccessForRoom } from "../services/youtubeAuth.js"
import { deletePlaylistForRoom } from "../services/youtubePlaylist.js"

export const roomsRouter = Router()

function readTrimmedString(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim().slice(0, maxLength)
  return trimmed.length > 0 ? trimmed : undefined
}

roomsRouter.post(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<CreateRoomRequest>
    const hostName = readTrimmedString(body.hostName, MAX_NAME_LENGTH)
    if (!hostName) {
      res.status(400).json({ error: "hostName is required" })
      return
    }
    const roomName = readTrimmedString(body.roomName, MAX_ROOM_NAME_LENGTH)
    const mode: RoomMode | undefined =
      body.mode === CAST_MODE || body.mode === PLAYLIST_MODE
        ? body.mode
        : undefined

    // Cast mode is a beta feature gated per-account — the client hides the
    // option unless it's enabled, but that's UX only, so re-check here
    // rather than trust a client-supplied mode.
    if (mode === CAST_MODE && !(await userHasBetaFeaturesEnabled(req.userId))) {
      res.status(403).json({
        error: "Cast mode requires enabling beta features in your account",
      })
      return
    }

    const { room, participant } = await createRoomWithHost({
      hostName,
      roomName,
      userId: req.userId,
      mode,
    })
    const participantToken = signParticipantToken(participant.id, room.id)

    const response: CreateRoomResponse = {
      room: serializeRoom(room),
      participant: serializeParticipant(participant, true),
      participantToken,
    }
    res.status(201).json(response)
  }),
)

roomsRouter.get(
  "/:code",
  asyncHandler(async (req, res) => {
    const code = req.params.code
    if (!code) {
      res.status(400).json({ error: "code is required" })
      return
    }
    const room = await getRoomByCode(code.toUpperCase())
    if (!room) {
      res.status(404).json({ error: "Room not found" })
      return
    }
    const preview: RoomPreview = {
      id: room.id,
      code: room.code,
      name: room.name,
      createdAt: room.createdAt.toISOString(),
    }
    res.json(preview)
  }),
)

roomsRouter.delete(
  "/:code",
  requireAuth,
  asyncHandler(async (req, res) => {
    const code = req.params.code
    if (!code) {
      res.status(400).json({ error: "code is required" })
      return
    }

    const found = await findDeletableRoom({
      roomCode: code.toUpperCase(),
      userId: req.userId as string,
    })
    if ("error" in found) {
      res.status(found.status).json({ error: found.error })
      return
    }

    if (found.room.youtubePlaylistId) {
      try {
        await deletePlaylistForRoom(found.room)
      } catch (err) {
        // Best-effort: the room (and all its app-side state) is gone
        // either way, so a stale/revoked YouTube token shouldn't block
        // deletion — just leave the orphaned playlist in their account.
        console.error(
          `Failed to delete YouTube playlist for room ${found.room.id}`,
          err,
        )
      }
    }

    if (found.room.youtubeRefreshToken || found.room.youtubeAccessToken) {
      try {
        await revokeYoutubeAccessForRoom(found.room)
      } catch (err) {
        // Best-effort, same reasoning as the playlist deletion above: an
        // already-expired/invalid token shouldn't block deletion, and our
        // own copy of it is gone regardless once the room row is deleted.
        console.error(
          `Failed to revoke YouTube access for room ${found.room.id}`,
          err,
        )
      }
    }

    await commitRoomDeletion(found.room.id)
    res.status(204).end()
  }),
)
