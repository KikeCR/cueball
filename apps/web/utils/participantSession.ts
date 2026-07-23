interface StoredSession {
  participantToken: string
}

function storageKey(roomCode: string): string {
  return `cueball:room:${roomCode}`
}

export function getStoredParticipantToken(roomCode: string): string | null {
  try {
    const raw = window.localStorage.getItem(storageKey(roomCode))
    if (!raw) return null
    return (JSON.parse(raw) as StoredSession).participantToken
  } catch {
    return null
  }
}

export function storeParticipantToken(
  roomCode: string,
  participantToken: string,
): void {
  const session: StoredSession = { participantToken }
  window.localStorage.setItem(storageKey(roomCode), JSON.stringify(session))
}

export function clearParticipantToken(roomCode: string): void {
  window.localStorage.removeItem(storageKey(roomCode))
}
