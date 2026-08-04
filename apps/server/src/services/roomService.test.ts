import { RoomMode } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./prisma.js", () => ({
  prisma: {
    room: {
      findUnique: vi.fn(),
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
    user: {
      findUnique: vi.fn(),
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
  commitRoomDeletion,
  findDeletableRoom,
  getUserRoomHistory,
  orderQueueForRoom,
  promoteParticipant,
  removeParticipant,
  renameParticipant,
  resolveNowPlayingQueueItem,
  roomAllowsLongVideos,
  roomAllowsRelatedVideos,
  setRoomName,
  setRoomRepeat,
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

  it("keeps the pinned item first even when a later vote would otherwise outrank it", () => {
    // "b" and "c" would normally sort ahead of "a" on score alone — the pin
    // is exactly what stops that from silently skipping "a" on the real
    // YouTube playlist once it's already playing.
    const result = sortQueueItems(items, false, "a")
    expect(result.map((i) => i.id)).toEqual(["a", "c", "b"])
  })

  it("ignores the pin in manual-order mode, since a host drag is deliberate", () => {
    const result = sortQueueItems(items, true, "a")
    expect(result.map((i) => i.id)).toEqual(["b", "c", "a"])
  })

  it("falls back to normal score order when the pinned id isn't in the list", () => {
    const result = sortQueueItems(items, false, "does-not-exist")
    expect(result.map((i) => i.id)).toEqual(["c", "b", "a"])
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

  it("passes the pin through to the unplayed section", () => {
    const items = [
      { id: "a", score: 1, position: 0, createdAt: new Date("2026-01-01"), playedAt: null },
      { id: "b", score: 5, position: 1, createdAt: new Date("2026-01-01"), playedAt: null },
    ]
    const result = orderQueueForRoom(items, false, "a")
    expect(result.map((i) => i.id)).toEqual(["a", "b"])
  })
})

describe("resolveNowPlayingQueueItem", () => {
  const unplayedItems = [
    { id: "a", score: 0, position: 0, createdAt: new Date("2026-01-01") },
    { id: "b", score: 0, position: 1, createdAt: new Date("2026-01-02") },
  ]

  beforeEach(() => {
    vi.mocked(prisma.room.update).mockReset()
  })

  it("returns null for Cast-mode rooms without touching the DB", async () => {
    const result = await resolveNowPlayingQueueItem({
      roomId: "r1",
      mode: RoomMode.CAST,
      currentPinId: null,
      unplayedItems,
    })
    expect(result).toBeNull()
    expect(prisma.room.update).not.toHaveBeenCalled()
  })

  it("keeps the existing pin when it's still an unplayed item, without writing to the DB", async () => {
    const result = await resolveNowPlayingQueueItem({
      roomId: "r1",
      mode: RoomMode.PLAYLIST,
      currentPinId: "b",
      unplayedItems,
    })
    expect(result).toBe("b")
    expect(prisma.room.update).not.toHaveBeenCalled()
  })

  it("pins whatever was added earliest (not the score leader) when nothing's ever been pinned yet", async () => {
    // "b" outscores "a" here — the real playlist has never been resynced at
    // this point, so its actual first item is still whichever was added
    // earliest, untouched by score. Picking the score leader here was the
    // real bug: it pinned a freshly-voted video as "already playing" and
    // pushed the video that's genuinely already loaded on the real
    // playlist out of position 0 — which is exactly how a 1-vote video
    // ended up silently skipped forever, since YouTube doesn't rewind to a
    // position it's already passed.
    const untouched = [
      { id: "a", score: 0, position: 0, createdAt: new Date("2026-01-01") },
      { id: "b", score: 5, position: 1, createdAt: new Date("2026-01-02") },
    ]
    const result = await resolveNowPlayingQueueItem({
      roomId: "r1",
      mode: RoomMode.PLAYLIST,
      currentPinId: null,
      unplayedItems: untouched,
    })
    expect(result).toBe("a")
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { nowPlayingQueueItemId: "a" },
    })
  })

  it("re-pins to the current score leader once the previous pin is no longer unplayed (played or removed)", async () => {
    // Unlike the "never pinned yet" case above, this scenario already had a
    // real sync happen — the previous pin advancing means whatever's left
    // was already ordered by score in that last sync, so the score leader
    // among what remains deterministically matches the real playlist's new
    // first item.
    const afterAdvancing = [
      { id: "a", score: 0, position: 0, createdAt: new Date("2026-01-01") },
      { id: "b", score: 5, position: 1, createdAt: new Date("2026-01-02") },
    ]
    const result = await resolveNowPlayingQueueItem({
      roomId: "r1",
      mode: RoomMode.PLAYLIST,
      currentPinId: "now-played-or-gone",
      unplayedItems: afterAdvancing,
    })
    expect(result).toBe("b")
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { nowPlayingQueueItemId: "b" },
    })
  })

  it("clears the pin once nothing is left unplayed", async () => {
    const result = await resolveNowPlayingQueueItem({
      roomId: "r1",
      mode: RoomMode.PLAYLIST,
      currentPinId: "a",
      unplayedItems: [],
    })
    expect(result).toBeNull()
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { nowPlayingQueueItemId: null },
    })
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

describe("promoteParticipant", () => {
  beforeEach(() => {
    vi.mocked(prisma.participant.findUnique).mockReset()
    vi.mocked(prisma.participant.findFirst).mockReset()
    vi.mocked(prisma.participant.update).mockReset()
    vi.mocked(prisma.room.update).mockReset()
  })

  it("rejects a requester who isn't the host", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValue({
      id: "requester-1",
      roomId: "room-1",
      isHost: false,
    } as never)

    const result = await promoteParticipant({
      roomId: "room-1",
      requesterId: "requester-1",
      targetId: "target-1",
    })

    expect(result).toEqual({ error: "Only the host can promote participants" })
    expect(prisma.participant.update).not.toHaveBeenCalled()
  })

  it("rejects a requester from a different room, even if they're a host there", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValue({
      id: "requester-1",
      roomId: "other-room",
      isHost: true,
    } as never)

    const result = await promoteParticipant({
      roomId: "room-1",
      requesterId: "requester-1",
      targetId: "target-1",
    })

    expect(result).toEqual({ error: "Only the host can promote participants" })
  })

  it("rejects promoting a participant who isn't in this room", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValue({
      id: "host-1",
      roomId: "room-1",
      isHost: true,
    } as never)
    vi.mocked(prisma.participant.findFirst).mockResolvedValue(null)

    const result = await promoteParticipant({
      roomId: "room-1",
      requesterId: "host-1",
      targetId: "missing",
    })

    expect(result).toEqual({ error: "Participant not found in this room" })
  })

  it("lets a host promote another participant to host", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValue({
      id: "host-1",
      roomId: "room-1",
      isHost: true,
    } as never)
    const target = { id: "target-1", roomId: "room-1", isHost: false }
    vi.mocked(prisma.participant.findFirst).mockResolvedValue(target as never)
    const promoted = { ...target, isHost: true }
    vi.mocked(prisma.participant.update).mockResolvedValue(promoted as never)
    vi.mocked(prisma.room.update).mockResolvedValue({} as never)

    const result = await promoteParticipant({
      roomId: "room-1",
      requesterId: "host-1",
      targetId: "target-1",
    })

    expect(prisma.participant.update).toHaveBeenCalledWith({
      where: { id: "target-1" },
      data: { isHost: true },
    })
    expect(result).toEqual({ promoted })
  })

  it("is a no-op when the target is already a host", async () => {
    vi.mocked(prisma.participant.findUnique).mockResolvedValue({
      id: "host-1",
      roomId: "room-1",
      isHost: true,
    } as never)
    const target = { id: "target-1", roomId: "room-1", isHost: true }
    vi.mocked(prisma.participant.findFirst).mockResolvedValue(target as never)

    const result = await promoteParticipant({
      roomId: "room-1",
      requesterId: "host-1",
      targetId: "target-1",
    })

    expect(prisma.participant.update).not.toHaveBeenCalled()
    expect(result).toEqual({ promoted: target })
  })
})

describe("findDeletableRoom", () => {
  beforeEach(() => {
    vi.mocked(prisma.room.findUnique).mockReset()
    vi.mocked(getConnectedParticipantIds).mockReset()
  })

  it("rejects when the room doesn't exist", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue(null)

    const result = await findDeletableRoom({
      roomCode: "MISSING",
      userId: "user-1",
    })

    expect(result).toEqual({ error: "Room not found", status: 404 })
  })

  it("rejects a requester who isn't the original host", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      id: "room-1",
      hostUserId: "user-1",
    } as never)

    const result = await findDeletableRoom({
      roomCode: "ABC123",
      userId: "someone-else",
    })

    expect(result).toEqual({
      error: "Only the original host can delete this room",
      status: 403,
    })
    expect(getConnectedParticipantIds).not.toHaveBeenCalled()
  })

  it("rejects when someone is currently connected", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      id: "room-1",
      hostUserId: "user-1",
    } as never)
    vi.mocked(getConnectedParticipantIds).mockResolvedValue(
      new Set(["participant-1"]),
    )

    const result = await findDeletableRoom({
      roomCode: "ABC123",
      userId: "user-1",
    })

    expect(result).toEqual({
      error: "Can't delete a room with people currently in it",
      status: 409,
    })
  })

  it("returns the room when the requester is the host and nobody's connected", async () => {
    const room = { id: "room-1", hostUserId: "user-1" }
    vi.mocked(prisma.room.findUnique).mockResolvedValue(room as never)
    vi.mocked(getConnectedParticipantIds).mockResolvedValue(new Set())

    const result = await findDeletableRoom({
      roomCode: "ABC123",
      userId: "user-1",
    })

    expect(result).toEqual({ room })
  })
})

describe("commitRoomDeletion", () => {
  beforeEach(() => {
    vi.mocked(prisma.room.delete).mockReset()
  })

  it("deletes the room by id", async () => {
    await commitRoomDeletion("room-1")
    expect(prisma.room.delete).toHaveBeenCalledWith({ where: { id: "room-1" } })
  })
})

describe("setRoomRepeat", () => {
  beforeEach(() => {
    vi.mocked(prisma.room.update).mockReset()
  })

  it("rejects a non-host requester", async () => {
    const result = await setRoomRepeat({
      roomId: "room-1",
      isHost: false,
      enabled: true,
    })

    expect(result).toEqual({ error: "Only the host can change repeat" })
    expect(prisma.room.update).not.toHaveBeenCalled()
  })

  it("updates repeatEnabled for the host", async () => {
    const room = { id: "room-1", repeatEnabled: true }
    vi.mocked(prisma.room.update).mockResolvedValue(room as never)

    const result = await setRoomRepeat({
      roomId: "room-1",
      isHost: true,
      enabled: true,
    })

    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: "room-1" },
      data: { repeatEnabled: true },
    })
    expect(result).toEqual({ room })
  })
})

describe("setRoomName", () => {
  beforeEach(() => {
    vi.mocked(prisma.room.update).mockReset()
  })

  it("rejects a non-host requester", async () => {
    const result = await setRoomName({
      roomId: "room-1",
      isHost: false,
      name: "Movie Night",
    })

    expect(result).toEqual({ error: "Only the host can rename the room" })
    expect(prisma.room.update).not.toHaveBeenCalled()
  })

  it("updates the room's name for the host", async () => {
    const room = { id: "room-1", name: "Movie Night" }
    vi.mocked(prisma.room.update).mockResolvedValue(room as never)

    const result = await setRoomName({
      roomId: "room-1",
      isHost: true,
      name: "Movie Night",
    })

    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: "room-1" },
      data: { name: "Movie Night" },
    })
    expect(result).toEqual({ room })
  })

  it("clears the room's name when given null", async () => {
    const room = { id: "room-1", name: null }
    vi.mocked(prisma.room.update).mockResolvedValue(room as never)

    await setRoomName({ roomId: "room-1", isHost: true, name: null })

    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: "room-1" },
      data: { name: null },
    })
  })
})

describe("roomAllowsLongVideos", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset()
  })

  it("returns false when the room has no original host (guest-created)", async () => {
    expect(await roomAllowsLongVideos(null)).toBe(false)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it("returns the host's own preference", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      allowLongVideos: true,
    } as never)

    expect(await roomAllowsLongVideos("user-1")).toBe(true)
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { allowLongVideos: true },
    })
  })

  it("returns false when the host's own preference is off", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      allowLongVideos: false,
    } as never)

    expect(await roomAllowsLongVideos("user-1")).toBe(false)
  })

  it("returns false if the host account no longer exists", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    expect(await roomAllowsLongVideos("deleted-user")).toBe(false)
  })
})

describe("roomAllowsRelatedVideos", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset()
  })

  it("returns false when the room has no original host (guest-created)", async () => {
    expect(await roomAllowsRelatedVideos(null)).toBe(false)
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it("returns the original host's own preference", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      relatedVideosBetaEnabled: true,
    } as never)

    expect(await roomAllowsRelatedVideos("user-1")).toBe(true)
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { relatedVideosBetaEnabled: true },
    })
  })

  it("returns false when the original host's own preference is off, regardless of a promoted host", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      relatedVideosBetaEnabled: false,
    } as never)

    expect(await roomAllowsRelatedVideos("user-1")).toBe(false)
  })

  it("returns false if the host account no longer exists", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    expect(await roomAllowsRelatedVideos("deleted-user")).toBe(false)
  })
})
