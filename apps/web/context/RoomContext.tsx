"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { io, type Socket } from "socket.io-client"
import {
  SocketEvents,
  type ActionError,
  type ActionOk,
  type CastCommandAction,
  type CastSessionState,
  type ParticipantRemovedPayload,
  type ParticipantWithPresence,
  type PlaylistSyncFailedPayload,
  type QueueClearResult,
  type QueueItem,
  type Room,
  type RoomJoinResult,
  type RoomStatePayload,
} from "@cueball/shared"
import {
  clearParticipantToken,
  getStoredParticipantToken,
  storeParticipantToken,
} from "../utils/participantSession"
import { getStoredUserToken } from "../utils/authSession"
import { decodeJwtPayload } from "../utils/jwt"

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000"
const RECONNECT_TIMEOUT_MS = 4000

// A quick tab switch doesn't need any help — socket.io's own reconnection
// handles a normal blip fine. A longer background stint is different,
// especially for an iOS home-screen PWA: the OS can silently kill the
// socket's underlying connection while the app is suspended without ever
// firing a close event, so the client-side socket object still thinks it's
// connected. Left alone, that's only noticed once a ping goes unanswered,
// which can take up to ~45s. Forcing a fresh handshake as soon as the page
// is visible again skips that wait.
const VISIBILITY_RECONNECT_THRESHOLD_MS = 5000

function emitAction(
  socket: Socket | null,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error("Not connected"))
      return
    }
    socket.emit(event, payload, (result: ActionOk | ActionError) => {
      if ("error" in result) {
        reject(new Error(result.error))
        return
      }
      resolve()
    })
  })
}

interface RoomContextValue {
  connected: boolean
  reconnecting: boolean
  /** Escape hatch for cast-specific socket events not covered by the actions below. */
  socket: Socket | null
  room: Room | null
  participants: ParticipantWithPresence[]
  queue: QueueItem[]
  cast: CastSessionState | null
  self: ParticipantWithPresence | null
  /** Set when the host removes this participant; cleared on the next successful join. */
  removedReason: string | null
  /** A fresh object each time a YouTube playlist sync fails, so repeated identical failures still notify. */
  playlistSyncError: { message: string; id: number } | null
  joinAsGuest: (guestName: string) => Promise<void>
  addToQueue: (youtubeUrl: string) => Promise<void>
  voteOnQueueItem: (queueItemId: string, value: 1 | -1) => Promise<void>
  removeQueueItem: (queueItemId: string) => Promise<void>
  reorderQueue: (orderedQueueItemIds: string[]) => Promise<void>
  setQueueItemPlayed: (queueItemId: string, played: boolean) => Promise<void>
  clearQueue: () => Promise<QueueClearResult>
  clearHistory: () => Promise<void>
  setRepeat: (enabled: boolean) => Promise<void>
  removeParticipant: (participantId: string) => Promise<void>
  promoteParticipant: (participantId: string) => Promise<void>
  renameSelf: (name: string) => Promise<void>
  renameRoom: (name: string) => Promise<void>
  sendCastCommand: (action: CastCommandAction, seekSeconds?: number) => Promise<void>
}

const RoomContext = createContext<RoomContextValue | null>(null)

export function RoomProvider({
  roomCode,
  children,
}: {
  roomCode: string
  children: ReactNode
}) {
  const socketRef = useRef<Socket | null>(null)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [room, setRoom] = useState<Room | null>(null)
  const [participants, setParticipants] = useState<ParticipantWithPresence[]>(
    [],
  )
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [cast, setCast] = useState<CastSessionState | null>(null)
  const [selfId, setSelfId] = useState<string | null>(null)
  const [removedReason, setRemovedReason] = useState<string | null>(null)
  const [playlistSyncError, setPlaylistSyncError] = useState<{
    message: string
    id: number
  } | null>(null)

  useEffect(() => {
    const token = getStoredParticipantToken(roomCode)
    let receivedState = false
    setReconnecting(Boolean(token))

    if (token) {
      const decoded = decodeJwtPayload<{ participantId: string }>(token)
      if (decoded) setSelfId(decoded.participantId)
    }

    const userToken = getStoredUserToken()
    const socket = io(SOCKET_URL, {
      auth: { ...(token ? { token } : {}), ...(userToken ? { userToken } : {}) },
    })
    socketRef.current = socket
    setSocket(socket)

    socket.on("connect", () => setConnected(true))
    socket.on("disconnect", () => setConnected(false))
    socket.on(SocketEvents.RoomState, (state: RoomStatePayload) => {
      receivedState = true
      setReconnecting(false)
      setRoom(state.room)
      setParticipants(state.participants)
      setQueue(state.queue)
      setCast(state.cast)
    })
    socket.on(
      SocketEvents.ParticipantRemoved,
      (payload: ParticipantRemovedPayload) => {
        clearParticipantToken(roomCode)
        setSelfId(null)
        setRemovedReason(payload.reason)
      },
    )
    socket.on(
      SocketEvents.PlaylistSyncFailed,
      (payload: PlaylistSyncFailedPayload) => {
        setPlaylistSyncError({ message: payload.reason, id: Date.now() })
      },
    )

    let staleTimer: number | undefined
    const scheduleStaleCheck = () => {
      if (staleTimer) window.clearTimeout(staleTimer)
      staleTimer = window.setTimeout(() => {
        if (!receivedState) {
          clearParticipantToken(roomCode)
          setSelfId(null)
          setReconnecting(false)
        }
      }, RECONNECT_TIMEOUT_MS)
    }
    if (token) scheduleStaleCheck()

    let hiddenAt: number | null = null
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now()
        return
      }
      if (hiddenAt === null) return
      const hiddenForMs = Date.now() - hiddenAt
      hiddenAt = null
      if (hiddenForMs < VISIBILITY_RECONNECT_THRESHOLD_MS) return

      // Force a fresh handshake unconditionally rather than checking
      // `socket.connected` first — after a real background suspension that
      // flag can't be trusted, since the transport can die silently without
      // the client ever finding out. Disconnecting a socket that actually
      // was still fine is cheap and harmless; it just repeats the same
      // rejoin round-trip a normal reconnect would do anyway.
      const currentToken = getStoredParticipantToken(roomCode)
      receivedState = false
      setReconnecting(Boolean(currentToken))
      if (currentToken) scheduleStaleCheck()
      socket.disconnect()
      socket.connect()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      if (staleTimer) window.clearTimeout(staleTimer)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      socket.disconnect()
      socketRef.current = null
      setSocket(null)
    }
  }, [roomCode])

  const joinAsGuest = useCallback(
    (guestName: string) =>
      new Promise<void>((resolve, reject) => {
        const socket = socketRef.current
        if (!socket) {
          reject(new Error("Not connected"))
          return
        }
        socket.emit(
          SocketEvents.RoomJoin,
          { roomCode, guestName },
          (result: RoomJoinResult | ActionError) => {
            if ("error" in result) {
              reject(new Error(result.error))
              return
            }
            storeParticipantToken(roomCode, result.participantToken)
            setRoom(result.room)
            setParticipants(result.participants)
            setQueue(result.queue)
            setCast(result.cast)
            setSelfId(result.participant.id)
            setRemovedReason(null)
            resolve()
          },
        )
      }),
    [roomCode],
  )

  const addToQueue = useCallback(
    (youtubeUrl: string) =>
      emitAction(socketRef.current, SocketEvents.QueueAdd, { youtubeUrl }),
    [],
  )

  const voteOnQueueItem = useCallback(
    (queueItemId: string, value: 1 | -1) =>
      emitAction(socketRef.current, SocketEvents.QueueVote, {
        queueItemId,
        value,
      }),
    [],
  )

  const removeQueueItem = useCallback(
    (queueItemId: string) =>
      emitAction(socketRef.current, SocketEvents.QueueRemove, { queueItemId }),
    [],
  )

  const reorderQueue = useCallback(
    (orderedQueueItemIds: string[]) =>
      emitAction(socketRef.current, SocketEvents.QueueReorder, {
        orderedQueueItemIds,
      }),
    [],
  )

  const setQueueItemPlayed = useCallback(
    (queueItemId: string, played: boolean) =>
      emitAction(socketRef.current, SocketEvents.QueueSetPlayed, {
        queueItemId,
        played,
      }),
    [],
  )

  const clearQueue = useCallback(
    () =>
      new Promise<QueueClearResult>((resolve, reject) => {
        const socket = socketRef.current
        if (!socket) {
          reject(new Error("Not connected"))
          return
        }
        socket.emit(
          SocketEvents.QueueClear,
          (result: QueueClearResult | ActionError) => {
            if ("error" in result) {
              reject(new Error(result.error))
              return
            }
            resolve(result)
          },
        )
      }),
    [],
  )

  const clearHistory = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        const socket = socketRef.current
        if (!socket) {
          reject(new Error("Not connected"))
          return
        }
        socket.emit(
          SocketEvents.QueueClearHistory,
          (result: ActionOk | ActionError) => {
            if ("error" in result) {
              reject(new Error(result.error))
              return
            }
            resolve()
          },
        )
      }),
    [],
  )

  const setRepeat = useCallback(
    (enabled: boolean) =>
      emitAction(socketRef.current, SocketEvents.RoomSetRepeat, { enabled }),
    [],
  )

  const removeParticipant = useCallback(
    (participantId: string) =>
      emitAction(socketRef.current, SocketEvents.ParticipantRemove, {
        participantId,
      }),
    [],
  )

  const promoteParticipant = useCallback(
    (participantId: string) =>
      emitAction(socketRef.current, SocketEvents.ParticipantPromote, {
        participantId,
      }),
    [],
  )

  const renameSelf = useCallback(
    (name: string) =>
      emitAction(socketRef.current, SocketEvents.ParticipantRename, { name }),
    [],
  )

  const renameRoom = useCallback(
    (name: string) =>
      emitAction(socketRef.current, SocketEvents.RoomRename, { name }),
    [],
  )

  const sendCastCommand = useCallback(
    (action: CastCommandAction, seekSeconds?: number) =>
      emitAction(socketRef.current, SocketEvents.CastCommand, {
        action,
        seekSeconds,
      }),
    [],
  )

  const self = participants.find((p) => p.id === selfId) ?? null

  return (
    <RoomContext.Provider
      value={{
        connected,
        reconnecting,
        socket,
        room,
        participants,
        queue,
        cast,
        self,
        removedReason,
        playlistSyncError,
        joinAsGuest,
        addToQueue,
        voteOnQueueItem,
        removeQueueItem,
        reorderQueue,
        setQueueItemPlayed,
        clearQueue,
        clearHistory,
        setRepeat,
        removeParticipant,
        promoteParticipant,
        renameSelf,
        renameRoom,
        sendCastCommand,
      }}
    >
      {children}
    </RoomContext.Provider>
  )
}

export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext)
  if (!ctx) throw new Error("useRoom must be used within RoomProvider")
  return ctx
}
