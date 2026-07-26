import { randomInt } from "node:crypto"
import { Prisma, type Participant, type Room } from "@prisma/client"
import { ROOM_CODE_LENGTH, type RoomMode } from "@cueball/shared"
import { getConnectedParticipantIds } from "../redis/presence.js"
import { getCastState } from "../redis/castSession.js"
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
  mode?: RoomMode
}): Promise<{ room: Room; participant: Participant }> {
  const mode = params.mode === "cast" ? "CAST" : "PLAYLIST"
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode()
    try {
      return await prisma.$transaction(async (tx) => {
        const room = await tx.room.create({
          data: { code, name: params.roomName, hostUserId: params.userId, mode },
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

/**
 * Joins a room. For an authenticated user, this reuses their existing
 * participant row for this room (if any) instead of creating a duplicate, so
 * the same account joining from a second device or tab reconnects as the
 * same participant rather than showing up as a separate person. Guests
 * (no userId) always get a fresh row, same as before.
 */
export async function addParticipant(params: {
  roomId: string
  guestName: string
  userId?: string
}): Promise<Participant> {
  return prisma.$transaction(async (tx) => {
    const existing = params.userId
      ? await tx.participant.findUnique({
          where: {
            roomId_userId: { roomId: params.roomId, userId: params.userId },
          },
        })
      : null

    const participant = existing
      ? await tx.participant.update({
          where: { id: existing.id },
          data: { guestName: params.guestName },
        })
      : await tx.participant.create({
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

/** Lets a participant change their own display name for the rest of the room. */
export async function renameParticipant(params: {
  participantId: string
  roomId: string
  name: string
}): Promise<Participant> {
  const participant = await prisma.participant.update({
    where: { id: params.participantId },
    data: { guestName: params.name },
  })
  await touchRoomActivity(params.roomId)
  return participant
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

export type FindDeletableRoomResult =
  | { room: Room }
  | { error: string; status: 403 | 404 | 409 }

/**
 * Only the original host may delete a room, and only while nobody's
 * currently connected to it. Doesn't delete anything yet — mirrors the
 * find/commit split used elsewhere (e.g. queueService's remove/reorder) so
 * the caller can attempt a best-effort real-playlist cleanup in between
 * (see deletePlaylistForRoom in youtubePlaylist.ts) without this file
 * needing to depend on that one.
 */
export async function findDeletableRoom(params: {
  roomCode: string
  userId: string
}): Promise<FindDeletableRoomResult> {
  const room = await prisma.room.findUnique({ where: { code: params.roomCode } })
  if (!room) {
    return { error: "Room not found", status: 404 }
  }
  if (room.hostUserId !== params.userId) {
    return { error: "Only the original host can delete this room", status: 403 }
  }
  const connected = await getConnectedParticipantIds(room.id)
  if (connected.size > 0) {
    return { error: "Can't delete a room with people currently in it", status: 409 }
  }
  return { room }
}

/** Deletes a room already confirmed deletable — Participants/QueueItems/Votes cascade. */
export async function commitRoomDeletion(roomId: string): Promise<void> {
  await prisma.room.delete({ where: { id: roomId } })
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

/**
 * Queue order defaults to vote score; `manualQueueOrder` (flipped on by a
 * host drag, off by a host vote) switches to the explicit `position` field
 * instead. Shared with `syncPlaylistOrder` so the real YouTube playlist and
 * the in-app queue never disagree about which mode is active.
 */
export function sortQueueItems<
  T extends { score: number; position: number; createdAt: Date },
>(items: T[], manualOrder: boolean): T[] {
  const sorted = [...items]
  if (manualOrder) {
    sorted.sort((a, b) => a.position - b.position)
  } else {
    sorted.sort(
      (a, b) => b.score - a.score || a.createdAt.getTime() - b.createdAt.getTime(),
    )
  }
  return sorted
}

/**
 * Unplayed items lead, in the room's current order mode; played items trail,
 * most-recently-played first, so the client can render them as a dimmed
 * "already watched" section below the upcoming queue.
 */
export function orderQueueForRoom<
  T extends {
    score: number
    position: number
    createdAt: Date
    playedAt: Date | null
  },
>(items: T[], manualOrder: boolean): T[] {
  const unplayed = items.filter((item) => !item.playedAt)
  const played = items
    .filter((item) => item.playedAt)
    .sort((a, b) => b.playedAt!.getTime() - a.playedAt!.getTime())
  return [...sortQueueItems(unplayed, manualOrder), ...played]
}

export async function getRoomState(roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      participants: true,
      queueItems: { include: { votes: true } },
    },
  })
  if (!room) return null

  const queueItems = orderQueueForRoom(room.queueItems, room.manualQueueOrder)

  const connected = await getConnectedParticipantIds(roomId)
  const cast = await getCastState(roomId)
  return {
    room: serializeRoom(room),
    participants: room.participants.map((p) =>
      serializeParticipant(p, connected.has(p.id)),
    ),
    queue: queueItems.map(serializeQueueItem),
    cast,
  }
}
