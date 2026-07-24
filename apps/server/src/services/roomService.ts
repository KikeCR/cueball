import { randomInt } from "node:crypto"
import { Prisma, type Participant, type Room } from "@prisma/client"
import { ROOM_CODE_LENGTH } from "@cueball/shared"
import { getConnectedParticipantIds } from "../redis/presence.js"
import {
  serializeParticipant,
  serializeQueueItem,
  serializeRoom,
} from "./serializers.js"
import { prisma } from "./prisma.js"

// Excludes visually ambiguous characters (0/O, 1/I/L).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const MAX_CODE_ATTEMPTS = 5

function generateRoomCode(): string {
  let code = ""
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
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
  userId?: string
}): Promise<{ room: Room; participant: Participant }> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode()
    try {
      return await prisma.$transaction(async (tx) => {
        const room = await tx.room.create({
          data: { code, name: params.roomName, hostUserId: params.userId },
        })
        const participant = await tx.participant.create({
          data: {
            roomId: room.id,
            guestName: params.hostName,
            isHost: true,
            userId: params.userId,
          },
        })
        return { room, participant }
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
  userId?: string
}): Promise<Participant> {
  return prisma.$transaction(async (tx) => {
    const participant = await tx.participant.create({
      data: {
        roomId: params.roomId,
        guestName: params.guestName,
        isHost: false,
        userId: params.userId,
      },
    })
    await tx.room.update({
      where: { id: params.roomId },
      data: { lastActiveAt: new Date() },
    })
    return participant
  })
}

export type RemoveParticipantResult =
  | { removed: Participant }
  | { error: string }

/** Only the host may remove another participant from their room; the host can't remove themselves. */
export async function removeParticipant(params: {
  roomId: string
  requesterId: string
  targetId: string
}): Promise<RemoveParticipantResult> {
  const requester = await prisma.participant.findUnique({
    where: { id: params.requesterId },
  })
  if (!requester || requester.roomId !== params.roomId || !requester.isHost) {
    return { error: "Only the host can remove participants" }
  }
  if (params.targetId === params.requesterId) {
    return { error: "You can't remove yourself" }
  }

  const target = await prisma.participant.findFirst({
    where: { id: params.targetId, roomId: params.roomId },
  })
  if (!target) {
    return { error: "Participant not found in this room" }
  }

  await prisma.participant.delete({ where: { id: target.id } })
  await touchRoomActivity(params.roomId)
  return { removed: target }
}

/** Marks a room as recently used, so the expiry sweep leaves it alone. */
export async function touchRoomActivity(roomId: string): Promise<void> {
  await prisma.room.update({
    where: { id: roomId },
    data: { lastActiveAt: new Date() },
  })
}

const DEFAULT_ROOM_EXPIRY_HOURS = Number(process.env.ROOM_EXPIRY_HOURS ?? 24)

/**
 * Deletes rooms that have had no activity for `expiryHours` and currently
 * have zero connected participants (checked at delete time, not just from
 * the stale `lastActiveAt` column, so a quiet-but-still-open room survives).
 */
export async function sweepExpiredRooms(
  expiryHours: number = DEFAULT_ROOM_EXPIRY_HOURS,
): Promise<number> {
  const cutoff = new Date(Date.now() - expiryHours * 60 * 60 * 1000)
  const candidates = await prisma.room.findMany({
    where: { lastActiveAt: { lt: cutoff } },
    select: { id: true },
  })

  let deletedCount = 0
  for (const candidate of candidates) {
    const connected = await getConnectedParticipantIds(candidate.id)
    if (connected.size > 0) continue
    await prisma.room.delete({ where: { id: candidate.id } })
    deletedCount++
  }
  return deletedCount
}

export async function getUserRoomHistory(userId: string): Promise<
  Array<{
    id: string
    code: string
    name: string | null
    isHost: boolean
    lastActiveAt: Date
  }>
> {
  const rooms = await prisma.room.findMany({
    where: {
      OR: [{ hostUserId: userId }, { participants: { some: { userId } } }],
    },
    select: { id: true, code: true, name: true, hostUserId: true, lastActiveAt: true },
    orderBy: { lastActiveAt: "desc" },
  })
  return rooms.map((room) => ({
    id: room.id,
    code: room.code,
    name: room.name,
    isHost: room.hostUserId === userId,
    lastActiveAt: room.lastActiveAt,
  }))
}

export async function getRoomState(roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      participants: true,
      queueItems: {
        include: { votes: true },
        orderBy: [{ score: "desc" }, { createdAt: "asc" }],
      },
    },
  })
  if (!room) return null

  const connected = await getConnectedParticipantIds(roomId)
  return {
    room: serializeRoom(room),
    participants: room.participants.map((p) =>
      serializeParticipant(p, connected.has(p.id)),
    ),
    queue: room.queueItems.map(serializeQueueItem),
  }
}
