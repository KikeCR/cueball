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
      deleteMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
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
  commitQueueClear,
  commitQueueHistoryClear,
  commitQueueItemPlayed,
  commitQueueItemRemoval,
  commitQueueRepeatRestart,
  commitQueueReorder,
  findClearableQueueItems,
  findQueueItemForPlayedToggle,
  findRemovableQueueItem,
  findRepeatRestartItems,
  isVideoAlreadyQueued,
  prepareQueueReorder,
} from "./queueService.js"

describe("isVideoAlreadyQueued", () => {
  beforeEach(() => {
    vi.mocked(prisma.queueItem.findFirst).mockReset()
  })

  it("returns true when the video is already unplayed in the queue", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue({ id: "item-1" } as never)

    const result = await isVideoAlreadyQueued({
      roomId: "room-1",
      youtubeVideoId: "abc123",
    })

    expect(prisma.queueItem.findFirst).toHaveBeenCalledWith({
      where: { roomId: "room-1", youtubeVideoId: "abc123", playedAt: null },
      select: { id: true },
    })
    expect(result).toBe(true)
  })

  it("returns false when there's no unplayed match (not queued, or the only match was already played)", async () => {
    // The playedAt: null filter means Prisma itself excludes played rows, so
    // this same "not found" result covers both cases.
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue(null)

    const result = await isVideoAlreadyQueued({
      roomId: "room-1",
      youtubeVideoId: "abc123",
    })

    expect(result).toBe(false)
  })
})

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

describe("prepareQueueReorder", () => {
  beforeEach(() => {
    vi.mocked(prisma.queueItem.findMany).mockReset()
  })

  it("rejects a non-host requester", async () => {
    const result = await prepareQueueReorder({
      roomId: "room-1",
      isHost: false,
      orderedQueueItemIds: ["a", "b"],
    })

    expect(result).toEqual({ error: "Only the host can reorder the queue" })
    expect(prisma.queueItem.findMany).not.toHaveBeenCalled()
  })

  it("rejects an order that doesn't match the room's current unplayed items", async () => {
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ] as never)

    const result = await prepareQueueReorder({
      roomId: "room-1",
      isHost: true,
      orderedQueueItemIds: ["a", "b"], // missing "c"
    })

    expect(result).toEqual({ error: "Queue changed, please try again" })
  })

  it("only compares against unplayed items, so a played video in the room doesn't block reordering", async () => {
    // Regression test: findMany used to fetch every queue item regardless of
    // playedAt, so any room with at least one played video would always
    // look "changed" (the played item never appears in the dragged order,
    // which only ever contains unplayed items) and reject every reorder.
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([
      { id: "a" },
      { id: "b" },
    ] as never)

    const result = await prepareQueueReorder({
      roomId: "room-1",
      isHost: true,
      orderedQueueItemIds: ["b", "a"], // no "c" (played), matches the UI's behavior
    })

    expect(prisma.queueItem.findMany).toHaveBeenCalledWith({
      where: { roomId: "room-1", playedAt: null },
      include: { votes: true },
    })
    expect("items" in result).toBe(true)
  })

  it("returns the full item rows in the requested order, without writing anything", async () => {
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
    ] as never)

    const result = await prepareQueueReorder({
      roomId: "room-1",
      isHost: true,
      orderedQueueItemIds: ["c", "a", "b"],
    })

    expect(result).toEqual({
      items: [
        { id: "c", title: "C" },
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ],
    })
  })
})

describe("commitQueueReorder", () => {
  beforeEach(() => {
    vi.mocked(prisma.queueItem.update).mockReset()
    vi.mocked(prisma.room.update).mockReset()
    vi.mocked(touchRoomActivity).mockReset()
  })

  it("writes position = index for each item in the new order, and switches the room into manual order", async () => {
    vi.mocked(prisma.queueItem.update).mockResolvedValue({} as never)
    vi.mocked(prisma.room.update).mockResolvedValue({} as never)

    await commitQueueReorder({
      roomId: "room-1",
      orderedQueueItemIds: ["c", "a", "b"],
    })

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

describe("findRemovableQueueItem", () => {
  beforeEach(() => {
    vi.mocked(prisma.queueItem.findFirst).mockReset()
  })

  it("returns an error when the item isn't in this room's queue", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue(null)

    const result = await findRemovableQueueItem({
      queueItemId: "missing",
      roomId: "room-1",
      participantId: "participant-1",
      isHost: false,
    })

    expect(result).toEqual({ error: "Video not found in this room's queue" })
  })

  it("lets the participant who added the video find it for removal", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue({
      id: "item-1",
      addedByParticipantId: "participant-1",
    } as never)

    const result = await findRemovableQueueItem({
      queueItemId: "item-1",
      roomId: "room-1",
      participantId: "participant-1",
      isHost: false,
    })

    expect("item" in result).toBe(true)
  })

  it("lets the host find a video someone else added", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue({
      id: "item-1",
      addedByParticipantId: "someone-else",
    } as never)

    const result = await findRemovableQueueItem({
      queueItemId: "item-1",
      roomId: "room-1",
      participantId: "host-participant",
      isHost: true,
    })

    expect("item" in result).toBe(true)
  })

  it("blocks a non-host, non-adder from removing someone else's video", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue({
      id: "item-1",
      addedByParticipantId: "someone-else",
    } as never)

    const result = await findRemovableQueueItem({
      queueItemId: "item-1",
      roomId: "room-1",
      participantId: "bystander",
      isHost: false,
    })

    expect(result).toEqual({
      error: "Only the person who added this, or the host, can remove it",
    })
  })
})

describe("commitQueueItemRemoval", () => {
  beforeEach(() => {
    vi.mocked(prisma.queueItem.delete).mockReset()
    vi.mocked(touchRoomActivity).mockReset()
  })

  it("deletes the item and marks the room active", async () => {
    vi.mocked(prisma.queueItem.delete).mockResolvedValue({} as never)

    await commitQueueItemRemoval({ queueItemId: "item-1", roomId: "room-1" })

    expect(prisma.queueItem.delete).toHaveBeenCalledWith({
      where: { id: "item-1" },
    })
    expect(touchRoomActivity).toHaveBeenCalledWith("room-1")
  })
})

describe("findQueueItemForPlayedToggle", () => {
  beforeEach(() => {
    vi.mocked(prisma.queueItem.findFirst).mockReset()
  })

  it("returns an error when the item isn't in this room's queue", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue(null)

    const result = await findQueueItemForPlayedToggle({
      queueItemId: "missing",
      roomId: "room-1",
      participantId: "participant-1",
      isHost: false,
      played: true,
    })

    expect(result).toEqual({ error: "Video not found in this room's queue" })
  })

  it("blocks a non-host, non-adder from marking someone else's video played", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue({
      id: "item-1",
      addedByParticipantId: "someone-else",
    } as never)

    const result = await findQueueItemForPlayedToggle({
      queueItemId: "item-1",
      roomId: "room-1",
      participantId: "bystander",
      isHost: false,
      played: true,
    })

    expect(result).toEqual({
      error: "Only the person who added this, or the host, can mark it played",
    })
  })

  it("lets the participant who added the video mark it played", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValue({
      id: "item-1",
      addedByParticipantId: "participant-1",
    } as never)

    const result = await findQueueItemForPlayedToggle({
      queueItemId: "item-1",
      roomId: "room-1",
      participantId: "participant-1",
      isHost: false,
      played: true,
    })

    expect("item" in result).toBe(true)
  })

  it("lets the host find someone else's video to mark unplayed when it's not duplicated elsewhere", async () => {
    vi.mocked(prisma.queueItem.findFirst)
      .mockResolvedValueOnce({
        id: "item-1",
        addedByParticipantId: "someone-else",
        youtubeVideoId: "abc123",
      } as never)
      // The internal isVideoAlreadyQueued lookup: no unplayed duplicate.
      .mockResolvedValueOnce(null)

    const result = await findQueueItemForPlayedToggle({
      queueItemId: "item-1",
      roomId: "room-1",
      participantId: "host-participant",
      isHost: true,
      played: false,
    })

    expect("item" in result).toBe(true)
  })

  it("blocks un-marking a played video when it's already been re-added to the queue", async () => {
    vi.mocked(prisma.queueItem.findFirst)
      .mockResolvedValueOnce({
        id: "item-1",
        addedByParticipantId: "host-participant",
        youtubeVideoId: "abc123",
      } as never)
      // The internal isVideoAlreadyQueued lookup: an unplayed duplicate exists.
      .mockResolvedValueOnce({ id: "item-2" } as never)

    const result = await findQueueItemForPlayedToggle({
      queueItemId: "item-1",
      roomId: "room-1",
      participantId: "host-participant",
      isHost: true,
      played: false,
    })

    expect(result).toEqual({ error: "That video is already in the queue" })
  })

  it("doesn't run the duplicate check when marking played (only relevant for un-marking)", async () => {
    vi.mocked(prisma.queueItem.findFirst).mockResolvedValueOnce({
      id: "item-1",
      addedByParticipantId: "participant-1",
      youtubeVideoId: "abc123",
    } as never)

    await findQueueItemForPlayedToggle({
      queueItemId: "item-1",
      roomId: "room-1",
      participantId: "participant-1",
      isHost: false,
      played: true,
    })

    // Only the item lookup itself, no second findFirst for a duplicate check.
    expect(prisma.queueItem.findFirst).toHaveBeenCalledTimes(1)
  })
})

describe("commitQueueItemPlayed", () => {
  beforeEach(() => {
    vi.mocked(prisma.queueItem.update).mockReset()
    vi.mocked(touchRoomActivity).mockReset()
  })

  it("sets playedAt when marking played, and marks the room active", async () => {
    vi.mocked(prisma.queueItem.update).mockResolvedValue({
      id: "item-1",
      playedAt: new Date("2026-07-24"),
    } as never)

    await commitQueueItemPlayed({
      queueItemId: "item-1",
      roomId: "room-1",
      played: true,
    })

    expect(prisma.queueItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { playedAt: expect.any(Date) },
      include: { votes: true },
    })
    expect(touchRoomActivity).toHaveBeenCalledWith("room-1")
  })

  it("clears playedAt when un-marking", async () => {
    vi.mocked(prisma.queueItem.update).mockResolvedValue({
      id: "item-1",
      playedAt: null,
    } as never)

    await commitQueueItemPlayed({
      queueItemId: "item-1",
      roomId: "room-1",
      played: false,
    })

    expect(prisma.queueItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { playedAt: null },
      include: { votes: true },
    })
  })
})

describe("findClearableQueueItems", () => {
  beforeEach(() => {
    vi.mocked(prisma.queueItem.findMany).mockReset()
  })

  it("rejects a non-host requester", async () => {
    const result = await findClearableQueueItems({
      roomId: "room-1",
      isHost: false,
    })

    expect(result).toEqual({ error: "Only the host can clear the queue" })
    expect(prisma.queueItem.findMany).not.toHaveBeenCalled()
  })

  it("returns the room's unplayed items for a host", async () => {
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([
      { id: "item-1", votes: [] },
      { id: "item-2", votes: [] },
    ] as never)

    const result = await findClearableQueueItems({
      roomId: "room-1",
      isHost: true,
    })

    expect(prisma.queueItem.findMany).toHaveBeenCalledWith({
      where: { roomId: "room-1", playedAt: null },
      include: { votes: true },
    })
    expect("items" in result && result.items).toHaveLength(2)
  })
})

describe("commitQueueClear", () => {
  beforeEach(() => {
    vi.mocked(prisma.queueItem.deleteMany).mockReset()
    vi.mocked(touchRoomActivity).mockReset()
  })

  it("deletes the given queue items and marks the room active", async () => {
    await commitQueueClear({ roomId: "room-1", queueItemIds: ["item-1", "item-2"] })

    expect(prisma.queueItem.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["item-1", "item-2"] } },
    })
    expect(touchRoomActivity).toHaveBeenCalledWith("room-1")
  })

  it("does nothing when given no ids", async () => {
    await commitQueueClear({ roomId: "room-1", queueItemIds: [] })

    expect(prisma.queueItem.deleteMany).not.toHaveBeenCalled()
    expect(touchRoomActivity).not.toHaveBeenCalled()
  })
})

describe("commitQueueHistoryClear", () => {
  beforeEach(() => {
    vi.mocked(prisma.queueItem.deleteMany).mockReset()
    vi.mocked(touchRoomActivity).mockReset()
  })

  it("rejects a non-host requester", async () => {
    const result = await commitQueueHistoryClear({
      roomId: "room-1",
      isHost: false,
    })

    expect(result).toEqual({ error: "Only the host can clear played history" })
    expect(prisma.queueItem.deleteMany).not.toHaveBeenCalled()
  })

  it("deletes played items and returns the cleared count", async () => {
    vi.mocked(prisma.queueItem.deleteMany).mockResolvedValue({ count: 3 } as never)

    const result = await commitQueueHistoryClear({
      roomId: "room-1",
      isHost: true,
    })

    expect(prisma.queueItem.deleteMany).toHaveBeenCalledWith({
      where: { roomId: "room-1", playedAt: { not: null } },
    })
    expect(result).toEqual({ clearedCount: 3 })
    expect(touchRoomActivity).toHaveBeenCalledWith("room-1")
  })
})

describe("findRepeatRestartItems", () => {
  beforeEach(() => {
    vi.mocked(prisma.queueItem.count).mockReset()
    vi.mocked(prisma.queueItem.findMany).mockReset()
  })

  it("is a no-op when repeat is disabled", async () => {
    const result = await findRepeatRestartItems({
      roomId: "room-1",
      repeatEnabled: false,
    })

    expect(result).toEqual({ noop: true })
    expect(prisma.queueItem.count).not.toHaveBeenCalled()
  })

  it("is a no-op when unplayed items remain", async () => {
    vi.mocked(prisma.queueItem.count).mockResolvedValue(2)

    const result = await findRepeatRestartItems({
      roomId: "room-1",
      repeatEnabled: true,
    })

    expect(result).toEqual({ noop: true })
    expect(prisma.queueItem.findMany).not.toHaveBeenCalled()
  })

  it("is a no-op when there's no played history to restart", async () => {
    vi.mocked(prisma.queueItem.count).mockResolvedValue(0)
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([])

    const result = await findRepeatRestartItems({
      roomId: "room-1",
      repeatEnabled: true,
    })

    expect(result).toEqual({ noop: true })
  })

  it("returns played items oldest-played first when everything's played and repeat is on", async () => {
    vi.mocked(prisma.queueItem.count).mockResolvedValue(0)
    vi.mocked(prisma.queueItem.findMany).mockResolvedValue([
      { id: "item-1", votes: [] },
      { id: "item-2", votes: [] },
    ] as never)

    const result = await findRepeatRestartItems({
      roomId: "room-1",
      repeatEnabled: true,
    })

    expect(prisma.queueItem.findMany).toHaveBeenCalledWith({
      where: { roomId: "room-1", playedAt: { not: null } },
      include: { votes: true },
      orderBy: { playedAt: "asc" },
    })
    expect("items" in result && result.items).toHaveLength(2)
  })
})

describe("commitQueueRepeatRestart", () => {
  beforeEach(() => {
    vi.mocked(prisma.queueItem.updateMany).mockReset()
    vi.mocked(touchRoomActivity).mockReset()
  })

  it("does nothing for an empty list", async () => {
    await commitQueueRepeatRestart({ roomId: "room-1", queueItemIds: [] })

    expect(prisma.queueItem.updateMany).not.toHaveBeenCalled()
    expect(touchRoomActivity).not.toHaveBeenCalled()
  })

  it("resets the given items back to unplayed", async () => {
    await commitQueueRepeatRestart({
      roomId: "room-1",
      queueItemIds: ["item-1", "item-2"],
    })

    expect(prisma.queueItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["item-1", "item-2"] } },
      data: { playedAt: null },
    })
    expect(touchRoomActivity).toHaveBeenCalledWith("room-1")
  })
})
