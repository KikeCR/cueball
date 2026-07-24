import { beforeEach, describe, expect, it, vi } from "vitest"

// $transaction supports both forms queueService.ts uses: a callback (invoked
// with the same mocked client, since this mock doesn't need to distinguish a
// transactional context from a direct call) and an array of promises (just
// awaited together, like the real batch form).
vi.mock("./prisma.js", () => {
  const prisma = {
    queueItem: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    room: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    vote: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)(prisma)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  }
  return { prisma }
})

// Mocked directly (rather than letting queueService pull in the real
// roomService.ts) so this test doesn't transitively import the real Redis
// client that roomService.ts depends on.
vi.mock("./roomService.js", () => ({
  touchRoomActivity: vi.fn(),
}))

import { prisma } from "./prisma.js"
import { touchRoomActivity } from "./roomService.js"
import {
  addQueueItem,
  castVote,
  removeQueueItem,
  reorderQueue,
  setQueueItemPlayed,
} from "./queueService.js"

describe("addQueueItem", () => {
  beforeEach(() => {
    vi.mocked(touchRoomActivity).mockReset()
    vi.mocked(prisma.queueItem.aggregate).mockReset()
  })

  it("creates a queue item with the given fields and marks the room active", async () => {
    vi.mocked(prisma.queueItem.aggregate).mockResolvedValue({
      _max: { position: 2 },
    } as never)
    vi.mocked(prisma.queueItem.create).mockResolvedValue({
      id: "item-1",
      votes: [],
    } as never)

    await addQueueItem({
      roomId: "room-1",
      addedByParticipantId: "participant-1",
      youtubeVideoId: "dQw4w9WgXcQ",
      title: "A Video",
      thumbnailUrl: "https://i.ytimg.com/thumb.jpg",
    })

    expect(prisma.queueItem.create).toHaveBeenCalledWith({
      data: {
        roomId: "room-1",
        youtubeVideoId: "dQw4w9WgXcQ",
        title: "A Video",
        thumbnailUrl: "https://i.ytimg.com/thumb.jpg",
        addedByParticipantId: "participant-1",
        position: 3,
      },
      include: { votes: true },
    })
    expect(touchRoomActivity).toHaveBeenCalledWith("room-1")
  })

  it("appends at position 0 for the first item in an empty room", async () => {
    vi.mocked(prisma.queueItem.aggregate).mockResolvedValue({
      _max: { position: null },
    } as never)
    vi.mocked(prisma.queueItem.create).mockResolvedValue({
      id: "item-1",
      votes: [],
    } as never)

    await addQueueItem({
      roomId: "room-1",
      addedByParticipantId: "participant-1",
      youtubeVideoId: "dQw4w9WgXcQ",
      title: "A Video",
      thumbnailUrl: null,
    })

    expect(prisma.queueItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ position: 0 }) }),
    )
  })
})

describe("reorderQueue", () => {
  beforeEach(() => {
    vi.mocked(prisma.queueItem.findMany).mockReset()
    vi.mocked(prisma.queueItem.update).mockReset()
    vi.mocked(prisma.room.update).mockReset()
    vi.mocked(touchRoomActivity).mockReset()
  })

  it("rejects a non-host requester", async () => {
    const result = await reorderQueue({
      roomId: "room-1",
      isHost: false,
      orderedQueueItemIds: ["a", "b"],
    })

    expect(result).toEqual({ error: "Only the host can reorder the queue" })
    expect(prisma.queueItem.findMany).not.toHaveBeenCalled()
  })

  it("rejects an order that doesn't match the room's current items", async () => {
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ] as never)

    const result = await reorderQueue({
      roomId: "room-1",
      isHost: true,
      orderedQueueItemIds: ["a", "b"], // missing "c"
    })

    expect(result).toEqual({ error: "Queue changed, please try again" })
    expect(prisma.queueItem.update).not.toHaveBeenCalled()
  })

  it("writes position = index for each item in the new order, and switches the room into manual order", async () => {
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ] as never)
    vi.mocked(prisma.queueItem.update).mockResolvedValue({} as never)
    vi.mocked(prisma.room.update).mockResolvedValue({} as never)

    const result = await reorderQueue({
      roomId: "room-1",
      isHost: true,
      orderedQueueItemIds: ["c", "a", "b"],
    })

    expect(result).toEqual({ ok: true })
    expect(prisma.queueItem.update).toHaveBeenCalledWith({
      where: { id: "c" },
      data: { position: 0 },
    })
    expect(prisma.queueItem.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { position: 1 },
    })
    expect(prisma.queueItem.update).toHaveBeenCalledWith({
      where: { id: "b" },
      data: { position: 2 },
    })
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: "room-1" },
      data: { manualQueueOrder: true },
    })
    expect(touchRoomActivity).toHaveBeenCalledWith("room-1")
  })
})

describe("castVote", () => {
  beforeEach(() => {
    vi.mocked(prisma.vote.findUnique).mockReset()
    vi.mocked(prisma.vote.create).mockReset()
    vi.mocked(prisma.vote.delete).mockReset()
    vi.mocked(prisma.vote.update).mockReset()
    vi.mocked(prisma.vote.findMany).mockReset().mockResolvedValue([])
    vi.mocked(prisma.queueItem.findUnique)
      .mockReset()
      .mockResolvedValue({ id: "item-1", roomId: "room-1" } as never)
    vi.mocked(prisma.room.findUnique)
      .mockReset()
      .mockResolvedValue({ manualQueueOrder: false } as never)
    vi.mocked(prisma.room.update).mockReset().mockResolvedValue({} as never)
    vi.mocked(prisma.queueItem.update)
      .mockReset()
      .mockResolvedValue({ score: 0, roomId: "room-1" } as never)
  })

  it("creates a new vote when the participant hasn't voted on this item yet", async () => {
    vi.mocked(prisma.vote.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.vote.findMany).mockResolvedValue([{ value: 1 }] as never)

    await castVote({
      queueItemId: "item-1",
      participantId: "participant-1",
      isHost: false,
      value: 1,
    })

    expect(prisma.vote.create).toHaveBeenCalledWith({
      data: { queueItemId: "item-1", participantId: "participant-1", value: 1 },
    })
    expect(prisma.queueItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { score: 1 },
      include: { votes: true },
    })
  })

  it("removes the vote when casting the same value again (toggle off)", async () => {
    vi.mocked(prisma.vote.findUnique).mockResolvedValue({
      id: "vote-1",
      value: 1,
    } as never)

    await castVote({
      queueItemId: "item-1",
      participantId: "participant-1",
      isHost: false,
      value: 1,
    })

    expect(prisma.vote.delete).toHaveBeenCalledWith({ where: { id: "vote-1" } })
    expect(prisma.vote.create).not.toHaveBeenCalled()
    expect(prisma.vote.update).not.toHaveBeenCalled()
  })

  it("flips the vote when casting the opposite value", async () => {
    vi.mocked(prisma.vote.findUnique).mockResolvedValue({
      id: "vote-1",
      value: 1,
    } as never)

    await castVote({
      queueItemId: "item-1",
      participantId: "participant-1",
      isHost: false,
      value: -1,
    })

    expect(prisma.vote.update).toHaveBeenCalledWith({
      where: { id: "vote-1" },
      data: { value: -1 },
    })
    expect(prisma.vote.create).not.toHaveBeenCalled()
    expect(prisma.vote.delete).not.toHaveBeenCalled()
  })

  it("recomputes the score as the sum of all votes after the change", async () => {
    vi.mocked(prisma.vote.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.vote.findMany).mockResolvedValue([
      { value: 1 },
      { value: 1 },
      { value: -1 },
    ] as never)

    await castVote({
      queueItemId: "item-1",
      participantId: "participant-2",
      isHost: false,
      value: 1,
    })

    expect(prisma.queueItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { score: 1 } }),
    )
  })

  it("rejects a non-host vote while the room is in manual (host-reordered) mode", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      manualQueueOrder: true,
    } as never)

    const result = await castVote({
      queueItemId: "item-1",
      participantId: "participant-1",
      isHost: false,
      value: 1,
    })

    expect(result).toEqual({
      error: "The host set a custom order; only they can vote right now",
    })
    expect(prisma.vote.create).not.toHaveBeenCalled()
    expect(prisma.queueItem.update).not.toHaveBeenCalled()
  })

  it("lets the host vote while in manual mode, and hands ordering back to the votes", async () => {
    vi.mocked(prisma.room.findUnique).mockResolvedValue({
      manualQueueOrder: true,
    } as never)
    vi.mocked(prisma.vote.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.vote.findMany).mockResolvedValue([{ value: 1 }] as never)

    const result = await castVote({
      queueItemId: "item-1",
      participantId: "host-participant",
      isHost: true,
      value: 1,
    })

    expect(prisma.vote.create).toHaveBeenCalled()
    expect(prisma.room.update).toHaveBeenCalledWith({
      where: { id: "room-1" },
      data: { manualQueueOrder: false },
    })
    expect(result).toEqual({ item: { score: 0, roomId: "room-1" } })
  })

  it("doesn't touch manualQueueOrder when already in vote-driven mode", async () => {
    vi.mocked(prisma.vote.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.vote.findMany).mockResolvedValue([{ value: 1 }] as never)

    await castVote({
      queueItemId: "item-1",
      participantId: "participant-1",
      isHost: false,
      value: 1,
    })

    expect(prisma.room.update).not.toHaveBeenCalled()
  })
})

describe("removeQueueItem", () => {
  beforeEach(() => {
    vi.mocked(prisma.queueItem.findFirst).mockReset()
    vi.mocked(prisma.queueItem.delete).mockReset()
    vi.mocked(touchRoomActivity).mockReset()
  })

  it("returns an error when the item isn't in this room's queue", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue(null)

    const result = await removeQueueItem({
      queueItemId: "missing",
      roomId: "room-1",
      participantId: "participant-1",
      isHost: false,
    })

    expect(result).toEqual({ error: "Video not found in this room's queue" })
    expect(prisma.queueItem.delete).not.toHaveBeenCalled()
  })

  it("lets the participant who added the video remove it", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue({
      id: "item-1",
      addedByParticipantId: "participant-1",
    } as never)

    const result = await removeQueueItem({
      queueItemId: "item-1",
      roomId: "room-1",
      participantId: "participant-1",
      isHost: false,
    })

    expect("removed" in result).toBe(true)
    expect(prisma.queueItem.delete).toHaveBeenCalledWith({
      where: { id: "item-1" },
    })
    expect(touchRoomActivity).toHaveBeenCalledWith("room-1")
  })

  it("lets the host remove a video someone else added", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue({
      id: "item-1",
      addedByParticipantId: "someone-else",
    } as never)

    const result = await removeQueueItem({
      queueItemId: "item-1",
      roomId: "room-1",
      participantId: "host-participant",
      isHost: true,
    })

    expect("removed" in result).toBe(true)
    expect(prisma.queueItem.delete).toHaveBeenCalled()
  })

  it("blocks a non-host, non-adder from removing someone else's video", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue({
      id: "item-1",
      addedByParticipantId: "someone-else",
    } as never)

    const result = await removeQueueItem({
      queueItemId: "item-1",
      roomId: "room-1",
      participantId: "bystander",
      isHost: false,
    })

    expect(result).toEqual({
      error: "Only the person who added this, or the host, can remove it",
    })
    expect(prisma.queueItem.delete).not.toHaveBeenCalled()
    expect(touchRoomActivity).not.toHaveBeenCalled()
  })
})

describe("setQueueItemPlayed", () => {
  beforeEach(() => {
    vi.mocked(prisma.queueItem.findFirst).mockReset()
    vi.mocked(prisma.queueItem.update).mockReset()
    vi.mocked(touchRoomActivity).mockReset()
  })

  it("returns an error when the item isn't in this room's queue", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue(null)

    const result = await setQueueItemPlayed({
      queueItemId: "missing",
      roomId: "room-1",
      participantId: "participant-1",
      isHost: false,
      played: true,
    })

    expect(result).toEqual({ error: "Video not found in this room's queue" })
    expect(prisma.queueItem.update).not.toHaveBeenCalled()
  })

  it("blocks a non-host, non-adder from marking someone else's video played", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue({
      id: "item-1",
      addedByParticipantId: "someone-else",
    } as never)

    const result = await setQueueItemPlayed({
      queueItemId: "item-1",
      roomId: "room-1",
      participantId: "bystander",
      isHost: false,
      played: true,
    })

    expect(result).toEqual({
      error: "Only the person who added this, or the host, can mark it played",
    })
    expect(prisma.queueItem.update).not.toHaveBeenCalled()
  })

  it("lets the participant who added the video mark it played", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue({
      id: "item-1",
      addedByParticipantId: "participant-1",
    } as never)
    vi.mocked(prisma.queueItem.update).mockResolvedValue({
      id: "item-1",
      playedAt: new Date("2026-07-24"),
    } as never)

    const result = await setQueueItemPlayed({
      queueItemId: "item-1",
      roomId: "room-1",
      participantId: "participant-1",
      isHost: false,
      played: true,
    })

    expect(prisma.queueItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { playedAt: expect.any(Date) },
      include: { votes: true },
    })
    expect(touchRoomActivity).toHaveBeenCalledWith("room-1")
    expect("item" in result).toBe(true)
  })

  it("lets the host mark someone else's video unplayed", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue({
      id: "item-1",
      addedByParticipantId: "someone-else",
    } as never)
    vi.mocked(prisma.queueItem.update).mockResolvedValue({
      id: "item-1",
      playedAt: null,
    } as never)

    await setQueueItemPlayed({
      queueItemId: "item-1",
      roomId: "room-1",
      participantId: "host-participant",
      isHost: true,
      played: false,
    })

    expect(prisma.queueItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { playedAt: null },
      include: { votes: true },
    })
  })
})
