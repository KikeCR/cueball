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
  type ParticipantRemovedPayload,
  type ParticipantWithPresence,
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
  room: Room | null
  participants: ParticipantWithPresence[]
  queue: QueueItem[]
  self: ParticipantWithPresence | null
  joinError: string | null
  /** Set when the host removes this participant; cleared on the next successful join. */
  removedReason: string | null
  joinAsGuest: (guestName: string) => Promise<void>
  addToQueue: (youtubeUrl: string) => Promise<void>
  voteOnQueueItem: (queueItemId: string, value: 1 | -1) => Promise<void>
  removeQueueItem: (queueItemId: string) => Promise<void>
  removeParticipant: (participantId: string) => Promise<void>
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
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [room, setRoom] = useState<Room | null>(null)
  const [participants, setParticipants] = useState<ParticipantWithPresence[]>(
    [],
  )
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [selfId, setSelfId] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [removedReason, setRemovedReason] = useState<string | null>(null)

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

    socket.on("connect", () => setConnected(true))
    socket.on("disconnect", () => setConnected(false))
    socket.on(SocketEvents.RoomState, (state: RoomStatePayload) => {
      receivedState = true
      setReconnecting(false)
      setRoom(state.room)
      setParticipants(state.participants)
      setQueue(state.queue)
    })
    socket.on(
      SocketEvents.ParticipantRemoved,
      (payload: ParticipantRemovedPayload) => {
        clearParticipantToken(roomCode)
        setSelfId(null)
        setRemovedReason(payload.reason)
      },
    )

    const staleTimer = token
      ? window.setTimeout(() => {
          if (!receivedState) {
            clearParticipantToken(roomCode)
            setSelfId(null)
            setReconnecting(false)
          }
        }, RECONNECT_TIMEOUT_MS)
      : undefined

    return () => {
      if (staleTimer) window.clearTimeout(staleTimer)
      socket.disconnect()
      socketRef.current = null
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
              setJoinError(result.error)
              reject(new Error(result.error))
              return
            }
            storeParticipantToken(roomCode, result.participantToken)
            setRoom(result.room)
            setParticipants(result.participants)
            setQueue(result.queue)
            setSelfId(result.participant.id)
            setJoinError(null)
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

  const removeParticipant = useCallback(
    (participantId: string) =>
      emitAction(socketRef.current, SocketEvents.ParticipantRemove, {
        participantId,
      }),
    [],
  )

  const self = participants.find((p) => p.id === selfId) ?? null

  return (
    <RoomContext.Provider
      value={{
        connected,
        reconnecting,
        room,
        participants,
        queue,
        self,
        joinError,
        removedReason,
        joinAsGuest,
        addToQueue,
        voteOnQueueItem,
        removeQueueItem,
        removeParticipant,
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
