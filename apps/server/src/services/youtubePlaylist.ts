import type { QueueItem, Room } from "@prisma/client"
import { prisma } from "./prisma.js"
import { getAuthorizedYoutubeClient } from "./youtubeAuth.js"

export async function createPlaylistForRoom(room: Room): Promise<string> {
  const youtube = getAuthorizedYoutubeClient(room)
  const res = await youtube.playlists.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: room.name ?? `CueBall - ${room.code}`,
        description: "Synced live by CueBall (cueball watch-party app)",
      },
      status: { privacyStatus: "unlisted" },
    },
  })

  const playlistId = res.data.id
  if (!playlistId) throw new Error("YouTube did not return a playlist id")

  await prisma.room.update({
    where: { id: room.id },
    data: { youtubePlaylistId: playlistId },
  })
  return playlistId
}

export async function addVideoToPlaylist(
  room: Room,
  queueItem: Pick<QueueItem, "id" | "youtubeVideoId">,
): Promise<void> {
  if (!room.youtubePlaylistId) return

  const youtube = getAuthorizedYoutubeClient(room)
  const res = await youtube.playlistItems.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        playlistId: room.youtubePlaylistId,
        resourceId: {
          kind: "youtube#video",
          videoId: queueItem.youtubeVideoId,
        },
      },
    },
  })

  const playlistItemId = res.data.id
  if (!playlistItemId) return
  await prisma.queueItem.update({
    where: { id: queueItem.id },
    data: { youtubePlaylistItemId: playlistItemId },
  })
}

/** Naive full resync: fine for a demo-sized queue, would want move-diffing to stay under quota at scale. */
export async function syncPlaylistOrder(roomId: string): Promise<void> {
  const room = await prisma.room.findUnique({ where: { id: roomId } })
  if (!room?.youtubePlaylistId) return
  const playlistId = room.youtubePlaylistId

  const allItems = await prisma.queueItem.findMany({
    where: { roomId },
    orderBy: [{ score: "desc" }, { createdAt: "asc" }],
  })
  const syncedItems = allItems.filter(
    (item): item is typeof item & { youtubePlaylistItemId: string } =>
      item.youtubePlaylistItemId !== null,
  )
  if (syncedItems.length === 0) return

  const youtube = getAuthorizedYoutubeClient(room)
  await Promise.all(
    syncedItems.map((item, index) =>
      youtube.playlistItems.update({
        part: ["snippet"],
        requestBody: {
          id: item.youtubePlaylistItemId,
          snippet: {
            playlistId,
            position: index,
            resourceId: { kind: "youtube#video", videoId: item.youtubeVideoId },
          },
        },
      }),
    ),
  )
}
