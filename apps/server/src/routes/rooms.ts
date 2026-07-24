import { Router } from "express"
import {
  MAX_NAME_LENGTH,
  MAX_ROOM_NAME_LENGTH,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type RoomPreview,
} from "@cueball/shared"
import { asyncHandler } from "../lib/asyncHandler.js"
import { optionalAuth } from "../middleware/auth.js"
import { createRoomWithHost, getRoomByCode } from "../services/roomService.js"
import { serializeParticipant, serializeRoom } from "../services/serializers.js"
import { signParticipantToken } from "../services/tokens.js"

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

    const { room, participant } = await createRoomWithHost({
      hostName,
      roomName,
      userId: req.userId,
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
