import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./prisma.js", () => ({
  prisma: {
    room: {
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    participant: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock("../redis/presence.js", () => ({
  getConnectedParticipantIds: vi.fn(),
}))

import { getConnectedParticipantIds } from "../redis/presence.js"
import { prisma } from "./prisma.js"
import {
  addParticipant,
  getUserRoomHistory,
  orderQueueForRoom,
  removeParticipant,
  renameParticipant,
  sortQueueItems,
  sweepExpiredRooms,
  touchRoomActivity,
} from "./roomService.js"

describe("sortQueueItems", () => {
  const items = [
    { id: "a", score: 1, position: 2, createdAt: new Date("2026-01-01") },
    { id: "b", score: 5, position: 0, createdAt: new Date("2026-01-02") },
    { id: "c", score: 5, position: 1, createdAt: new Date("2026-01-01") },
  ]

  it("sorts by score desc, then createdAt asc as a tiebreaker, when not in manual order", () => {
    const result = sortQueueItems(items, false)
    expect(result.map((i) => i.id)).toEqual(["c", "b", "a"])
  })

  it("sorts by explicit position when in manual order", () => {
    const result = sortQueueItems(items, true)
    expect(result.map((i) => i.id)).toEqual(["b", "c", "a"])
  })

  it("doesn't mutate the input array", () => {
    const original = [...items]
    sortQueueItems(items, true)
    expect(items).toEqual(original)
  })
})

describe("orderQueueForRoom", () => {
  it("puts unplayed items first, sorted by the room's order mode", () => {
    const items = [
      { id: "a", score: 1, position: 0, createdAt: new Date("2026-01-01"), playedAt: null },
      { id: "b", score: 5, position: 1, createdAt: new Date("2026-01-01"), playedAt: null },
    ]
    const result = orderQueueForRoom(items, false)
    expect(result.map((i) => i.id)).toEqual(["b", "a"])
  })

  it("puts played items after unplayed ones, most-recently-played first", () => {
    const items = [
      {
        id: "old-play",
        score: 0,
        position: 0,
        createdAt: new Date("2026-01-01"),
        playedAt: new Date("2026-01-01"),
      },
      {
        id: "upcoming",
        score: 0,
        position: 1,
        createdAt: new Date("2026-01-01"),
        playedAt: null,
      },
      {
        id: "recent-play",
        score: 0,
        position: 2,
        createdAt: new Date("2026-01-01"),
        playedAt: new Date("2026-01-03"),
      },
    ]
    const result = orderQueueForRoom(items, false)
    expect(result.map((i) => i.id)).toEqual(["upcoming", "recent-play", "old-play"])
  })
})

describe("touchRoomActivity", () => {
  it("bumps lastActiveAt to now", async () => {
    vi.mocked(prisma.room.update).mockResolvedValue({} as never)

    await touchRoomActivity("room-1")

    expect(prisma.room.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "room-1" } }),
    )
  })
})

describe("sweepExpiredRooms", () => {
  beforeEach(() => {
    vi.mocked(prisma.room.findMany).mockReset()
    vi.mocked(prisma.room.delete).mockReset()
    vi.mocked(getConnectedParticipantIds).mockReset()
  })

  it("deletes a stale room with nobody currently connected", async () => {
    vi.mocked(prisma.room.findMany).mockResolvedValue([
      { id: "room-1" },
    ] as never)
    vi.mocked(getConnectedParticipantIds).mockResolvedValue(new Set())

    const count = await sweepExpiredRooms(24)

    expect(prisma.room.delete).toHaveBeenCalledWith({ where: { id: "room-1" } })
    expect(count).toBe(1)
  })

  it("leaves a stale-by-timestamp room alone if someone is still connected", async () => {
    vi.mocked(prisma.room.findMany).mockResolvedValue([
      { id: "room-1" },
    ] as never)
    vi.mocked(getConnectedParticipantIds).mockResolvedValue(
      new Set(["participant-1"]),
    )

    const count = await sweepExpiredRooms(24)

    expect(prisma.room.delete).not.toHaveBeenCalled()
    expect(count).toBe(0)
  })

  it("only queries rooms past the cutoff", async () => {
    vi.mocked(prisma.room.findMany).mockResolvedValue([])

    await sweepExpiredRooms(6)

    const call = vi.mocked(prisma.room.findMany).mock.calls[0]?.[0] as {
      where: { lastActiveAt: { lt: Date } }
    }
    const cutoff = call.where.lastActiveAt.lt
    const expected = Date.now() - 6 * 60 * 60 * 1000
    expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(1000)
  })

  it("handles multiple candidates independently", async () => {
    vi.mocked(prisma.room.findMany).mockResolvedValue([
      { id: "room-1" },
      { id: "room-2" },
    ] as never)
    vi.mocked(getConnectedParticipantIds).mockImplementation(
      async (roomId: string) =>
        roomId === "room-1" ? new Set() : new Set(["still-here"]),
    )

    const count = await sweepExpiredRooms(24)

    expect(prisma.room.delete).toHaveBeenCalledTimes(1)
    expect(prisma.room.delete).toHaveBeenCalledWith({ where: { id: "room-1" } })
    expect(count).toBe(1)
  })
})

describe("getUserRoomHistory", () => {
  it("marks isHost based on whether the room's hostUserId matches", async () => {
    const lastActiveAt = new Date()
    vi.mocked(prisma.room.findMany).mockResolvedValue([
      {
        id: "room-1",
        code: "AAA111",
        name: "Hosted room",
        hostUserId: "user-1",
        lastActiveAt,
      },
      {
        id: "room-2",
        code: "BBB222",
        name: "Joined room",
        hostUserId: "someone-else",
        lastActiveAt,
      },
    ] as never)

    const history = await getUserRoomHistory("user-1")

    expect(prisma.room.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { hostUserId: "user-1" },
            { participants: { some: { userId: "user-1" } } },
          ],
        },
      }),
    )
    expect(history).toEqual([
      { id: "room-1", code: "AAA111", name: "Hosted room", isHost: true, lastActiveAt },
      { id: "room-2", code: "BBB222", name: "Joined room", isHost: false, lastActiveAt },
    ])
  })
})

describe("addParticipant", () => {
  beforeEach(() => {
    vi.mocked(prisma.participant.findUnique).mockReset()
    vi.mocked(prisma.participant.create).mockReset()
    vi.mocked(prisma.participant.update).mockReset()
    vi.mocked(prisma.room.update).mockReset().mockResolvedValue({} as never)
    vi.mocked(prisma.$transaction).mockImplementation(
      ((callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma)) as unknown as typeof prisma.$transaction,
    )
  })

  it("creates a fresh row for a guest with no userId", async () => {
    vi.mocked(prisma.participant.create).mockResolvedValue({
      id: "p-1",
      userId: undefined,
    } as never)

    await addParticipant({ roomId: "room-1", guestName: "Guest" })

    expect(prisma.participant.findUnique).not.toHaveBeenCalled()
    expect(prisma.participant.create).toHaveBeenCalledWith({
      data: { roomId: "room-1", guestName: "Guest", isHost: false, userId: undefined },
    })
  })

  it("creates a fresh row the first time an authenticated user joins a room", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.participant.create).mockResolvedValue({
      id: "p-1",
      userId: "user-1",
    } as never)

    await addParticipant({ roomId: "room-1", guestName: "Luis", userId: "user-1" })

    expect(prisma.participant.findUnique).toHaveBeenCalledWith({
      where: { roomId_userId: { roomId: "room-1", userId: "user-1" } },
    })
    expect(prisma.participant.create).toHaveBeenCalledWith({
      data: { roomId: "room-1", guestName: "Luis", isHost: false, userId: "user-1" },
    })
  })

  it("reuses the existing participant when the same account joins again (e.g. from another device)", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValue({
      id: "p-1",
      roomId: "room-1",
      userId: "user-1",
      guestName: "Luis",
    } as never)
    vi.mocked(prisma.participant.update).mockResolvedValue({
      id: "p-1",
      roomId: "room-1",
      userId: "user-1",
      guestName: "Luis B",
    } as never)

    const result = await addParticipant({
      roomId: "room-1",
      guestName: "Luis B",
      userId: "user-1",
    })

    expect(prisma.participant.create).not.toHaveBeenCalled()
    expect(prisma.participant.update).toHaveBeenCalledWith({
      where: { id: "p-1" },
      data: { guestName: "Luis B" },
    })
    expect(result).toEqual({
      id: "p-1",
      roomId: "room-1",
      userId: "user-1",
      guestName: "Luis B",
    })
  })
})

describe("renameParticipant", () => {
  beforeEach(() => {
    vi.mocked(prisma.participant.update).mockReset()
    vi.mocked(prisma.room.update).mockReset().mockResolvedValue({} as never)
  })

  it("updates the participant's guestName and touches room activity", async () => {
    vi.mocked(prisma.participant.update).mockResolvedValue({
      id: "p-1",
      guestName: "New Name",
    } as never)

    const result = await renameParticipant({
      participantId: "p-1",
      roomId: "room-1",
      name: "New Name",
    })

    expect(prisma.participant.update).toHaveBeenCalledWith({
      where: { id: "p-1" },
      data: { guestName: "New Name" },
    })
    expect(prisma.room.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "room-1" } }),
    )
    expect(result).toEqual({ id: "p-1", guestName: "New Name" })
  })
})

describe("removeParticipant", () => {
  beforeEach(() => {
    vi.mocked(prisma.participant.findUnique).mockReset()
    vi.mocked(prisma.participant.findFirst).mockReset()
    vi.mocked(prisma.participant.delete).mockReset()
    vi.mocked(prisma.room.update).mockReset()
  })

  it("rejects a requester who isn't the host", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValue({
      id: "requester-1",
      roomId: "room-1",
      isHost: false,
    } as never)

    const result = await removeParticipant({
      roomId: "room-1",
      requesterId: "requester-1",
      targetId: "target-1",
    })

    expect(result).toEqual({ error: "Only the host can remove participants" })
    expect(prisma.participant.delete).not.toHaveBeenCalled()
  })

  it("rejects a requester from a different room, even if they're a host there", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValue({
      id: "requester-1",
      roomId: "other-room",
      isHost: true,
    } as never)

    const result = await removeParticipant({
      roomId: "room-1",
      requesterId: "requester-1",
      targetId: "target-1",
    })

    expect(result).toEqual({ error: "Only the host can remove participants" })
  })

  it("rejects the host trying to remove themselves", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValue({
      id: "host-1",
      roomId: "room-1",
      isHost: true,
    } as never)

    const result = await removeParticipant({
      roomId: "room-1",
      requesterId: "host-1",
      targetId: "host-1",
    })

    expect(result).toEqual({ error: "You can't remove yourself" })
    expect(prisma.participant.delete).not.toHaveBeenCalled()
  })

  it("rejects removing a participant who isn't in this room", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValue({
      id: "host-1",
      roomId: "room-1",
      isHost: true,
    } as never)
    vi.mocked(prisma.participant.findFirst).mockResolvedValue(null)

    const result = await removeParticipant({
      roomId: "room-1",
      requesterId: "host-1",
      targetId: "missing",
    })

    expect(result).toEqual({ error: "Participant not found in this room" })
  })

  it("lets the host remove another participant", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValue({
      id: "host-1",
      roomId: "room-1",
      isHost: true,
    } as never)
    const target = { id: "target-1", roomId: "room-1", isHost: false }
    vi.mocked(prisma.participant.findFirst).mockResolvedValue(target as never)
    vi.mocked(prisma.participant.delete).mockResolvedValue(target as never)
    vi.mocked(prisma.room.update).mockResolvedValue({} as never)

    const result = await removeParticipant({
      roomId: "room-1",
      requesterId: "host-1",
      targetId: "target-1",
    })

    expect(prisma.participant.delete).toHaveBeenCalledWith({
      where: { id: "target-1" },
    })
    expect(result).toEqual({ removed: target })
  })
})
