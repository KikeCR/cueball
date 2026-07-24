import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me"

interface ParticipantTokenPayload {
  type: "participant"
  participantId: string
  roomId: string
}

export function signParticipantToken(
  participantId: string,
  roomId: string,
): string {
  const payload: ParticipantTokenPayload = {
    type: "participant",
    participantId,
    roomId,
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" })
}

export function verifyParticipantToken(
  token: string,
): { participantId: string; roomId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as ParticipantTokenPayload
    if (decoded.type !== "participant") return null
    return { participantId: decoded.participantId, roomId: decoded.roomId }
  } catch {
    return null
  }
}

interface UserTokenPayload {
  type: "user"
  userId: string
}

export function signUserToken(userId: string): string {
  const payload: UserTokenPayload = { type: "user", userId }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" })
}

export function verifyUserToken(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserTokenPayload
    if (decoded.type !== "user") return null
    return { userId: decoded.userId }
  } catch {
    return null
  }
}

interface YoutubeOAuthStatePayload {
  type: "youtube-oauth-state"
  roomId: string
}

/** Proves the OAuth callback corresponds to a /connect redirect we issued for this room. */
export function signYoutubeOAuthState(roomId: string): string {
  const payload: YoutubeOAuthStatePayload = {
    type: "youtube-oauth-state",
    roomId,
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "10m" })
}

export function verifyYoutubeOAuthState(
  state: string,
): { roomId: string } | null {
  try {
    const decoded = jwt.verify(state, JWT_SECRET) as YoutubeOAuthStatePayload
    if (decoded.type !== "youtube-oauth-state") return null
    return { roomId: decoded.roomId }
  } catch {
    return null
  }
}

interface GoogleAuthStatePayload {
  type: "google-auth-state"
}

/** Proves the OAuth callback corresponds to a /google/start redirect we issued. */
export function signGoogleAuthState(): string {
  const payload: GoogleAuthStatePayload = { type: "google-auth-state" }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "10m" })
}

export function verifyGoogleAuthState(state: string): boolean {
  try {
    const decoded = jwt.verify(state, JWT_SECRET) as GoogleAuthStatePayload
    return decoded.type === "google-auth-state"
  } catch {
    return false
  }
}
