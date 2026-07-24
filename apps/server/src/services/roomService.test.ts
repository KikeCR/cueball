import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./prisma.js", () => ({
  prisma: {
    room: {
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock("../redis/presence.js", () => ({
  getConnectedParticipantIds: vi.fn(),
}))

import { getConnectedParticipantIds } from "../redis/presence.js"
import { prisma } from "./prisma.js"
import {
  getUserRoomHistory,
  sweepExpiredRooms,
  touchRoomActivity,
} from "./roomService.js"

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
