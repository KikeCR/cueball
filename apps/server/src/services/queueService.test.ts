import { beforeEach, describe, expect, it, vi } from "vitest"

// $transaction just invokes the callback with the same mocked client, since
// this mock doesn't need to distinguish a transactional context from a
// direct call for these tests.
vi.mock("./prisma.js", () => {
  const prisma = {
    queueItem: {
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    vote: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  }
  return { prisma }
})

import { prisma } from "./prisma.js"
import { addQueueItem, castVote, removeQueueItem } from "./queueService.js"

describe("addQueueItem", () => {
  it("creates a queue item with the given fields", async () => {
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
      },
      include: { votes: true },
    })
  })
})

describe("castVote", () => {
  beforeEach(() => {
    vi.mocked(prisma.vote.findUnique).mockReset()
    vi.mocked(prisma.vote.create).mockReset()
    vi.mocked(prisma.vote.delete).mockReset()
    vi.mocked(prisma.vote.update).mockReset()
    vi.mocked(prisma.vote.findMany).mockReset().mockResolvedValue([])
    vi.mocked(prisma.queueItem.update)
      .mockReset()
      .mockResolvedValue({ score: 0 } as never)
  })

  it("creates a new vote when the participant hasn't voted on this item yet", async () => {
    vi.mocked(prisma.vote.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.vote.findMany).mockResolvedValue([{ value: 1 }] as never)

    await castVote({
      queueItemId: "item-1",
      participantId: "participant-1",
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
      value: 1,
    })

    expect(prisma.queueItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { score: 1 } }),
    )
  })
})

describe("removeQueueItem", () => {
  beforeEach(() => {
    vi.mocked(prisma.queueItem.findFirst).mockReset()
    vi.mocked(prisma.queueItem.delete).mockReset()
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
  })
})
