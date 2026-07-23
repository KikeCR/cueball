import { randomInt } from "node:crypto"
import { Prisma, type Participant, type Room } from "@prisma/client"
import { getConnectedParticipantIds } from "../redis/presence.js"
import {
  serializeParticipant,
  serializeQueueItem,
  serializeRoom,
} from "./serializers.js"
import { prisma } from "./prisma.js"

// Excludes visually ambiguous characters (0/O, 1/I/L).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 6
const MAX_CODE_ATTEMPTS = 5

function generateRoomCode(): string {
  let code = ""
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return code
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  )
}

export async function createRoomWithHost(params: {
  hostName: string
  roomName?: string
}): Promise<{ room: Room; participant: Participant }> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode()
    try {
      return await prisma.$transaction(async (tx) => {
        const room = await tx.room.create({
          data: { code, name: params.roomName },
        })
        const participant = await tx.participant.create({
          data: { roomId: room.id, guestName: params.hostName, isHost: true },
        })
        const updatedRoom = await tx.room.update({
          where: { id: room.id },
          data: { controllerId: participant.id },
        })
        return { room: updatedRoom, participant }
      })
    } catch (err) {
      if (isUniqueConstraintError(err)) continue
      throw err
    }
  }
  throw new Error("Failed to allocate a unique room code")
}

export async function getRoomByCode(code: string): Promise<Room | null> {
  return prisma.room.findUnique({ where: { code } })
}

export async function addParticipant(params: {
  roomId: string
  guestName: string
}): Promise<Participant> {
  return prisma.$transaction(async (tx) => {
    const participant = await tx.participant.create({
      data: {
        roomId: params.roomId,
        guestName: params.guestName,
        isHost: false,
      },
    })
    const room = await tx.room.findUniqueOrThrow({
      where: { id: params.roomId },
    })
    if (!room.controllerId) {
      await tx.room.update({
        where: { id: params.roomId },
        data: { controllerId: participant.id },
      })
    }
    return participant
  })
}

export async function getRoomState(roomId: string) {
  const room = await prisma.room.findUniqueOrThrow({
    where: { id: roomId },
    include: {
      participants: true,
      queueItems: {
        include: { votes: true },
        orderBy: [{ score: "desc" }, { createdAt: "asc" }],
      },
    },
  })
  const connected = await getConnectedParticipantIds(roomId)
  return {
    room: serializeRoom(room),
    participants: room.participants.map((p) =>
      serializeParticipant(p, connected.has(p.id)),
    ),
    queue: room.queueItems.map(serializeQueueItem),
  }
}
