import { Router } from "express"
import {
  MAX_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  type AuthResponse,
  type LoginRequest,
  type RegisterRequest,
  type RoomHistoryResponse,
} from "@cueball/shared"
import { asyncHandler } from "../lib/asyncHandler.js"
import { requireAuth } from "../middleware/auth.js"
import {
  AuthError,
  findOrCreateGoogleUser,
  getUserById,
  loginUser,
  registerUser,
} from "../services/authService.js"
import {
  GoogleAuthError,
  getGoogleAuthConsentUrl,
  isGoogleAuthConfigured,
  verifyGoogleIdentity,
} from "../services/googleAuth.js"
import { getUserRoomHistory } from "../services/roomService.js"
import { serializeUser } from "../services/serializers.js"
import {
  signGoogleAuthState,
  signUserToken,
  verifyGoogleAuthState,
} from "../services/tokens.js"

export const authRouter = Router()

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000"

// RFC 5321's practical max length for an email address.
const MAX_EMAIL_LENGTH = 254

function readTrimmedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim().slice(0, maxLength)
  return trimmed.length > 0 ? trimmed : undefined
}

authRouter.post(
  "/auth/register",
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<RegisterRequest>
    const email = readTrimmedString(body.email, MAX_EMAIL_LENGTH)?.toLowerCase()
    const displayName = readTrimmedString(body.displayName, MAX_NAME_LENGTH)
    const password = typeof body.password === "string" ? body.password : undefined

    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "A valid email is required" })
      return
    }
    if (!displayName) {
      res.status(400).json({ error: "displayName is required" })
      return
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      res
        .status(400)
        .json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` })
      return
    }

    try {
      const user = await registerUser({ email, password, displayName })
      const response: AuthResponse = {
        user: serializeUser(user),
        token: signUserToken(user.id),
      }
      res.status(201).json(response)
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(409).json({ error: err.message })
        return
      }
      throw err
    }
  }),
)

authRouter.post(
  "/auth/login",
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<LoginRequest>
    const email = readTrimmedString(body.email, MAX_EMAIL_LENGTH)?.toLowerCase()
    const password = typeof body.password === "string" ? body.password : undefined

    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" })
      return
    }

    try {
      const user = await loginUser({ email, password })
      const response: AuthResponse = {
        user: serializeUser(user),
        token: signUserToken(user.id),
      }
      res.json(response)
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(401).json({ error: err.message })
        return
      }
      throw err
    }
  }),
)

authRouter.get(
  "/auth/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await getUserById(req.userId as string)
    if (!user) {
      res.status(401).json({ error: "Authentication required" })
      return
    }
    res.json({ user: serializeUser(user) })
  }),
)

authRouter.get(
  "/auth/me/rooms",
  requireAuth,
  asyncHandler(async (req, res) => {
    const rooms = await getUserRoomHistory(req.userId as string)
    const response: RoomHistoryResponse = {
      rooms: rooms.map((room) => ({
        id: room.id,
        code: room.code,
        name: room.name,
        isHost: room.isHost,
        lastActiveAt: room.lastActiveAt.toISOString(),
      })),
    }
    res.json(response)
  }),
)

authRouter.get(
  "/auth/google/start",
  asyncHandler(async (_req, res) => {
    if (!isGoogleAuthConfigured()) {
      res.redirect(`${CLIENT_ORIGIN}/account?error=google_not_configured`)
      return
    }
    res.redirect(getGoogleAuthConsentUrl(signGoogleAuthState()))
  }),
)

authRouter.get(
  "/auth/google/callback",
  asyncHandler(async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined
    const state =
      typeof req.query.state === "string" ? req.query.state : undefined

    if (!code || !state || !verifyGoogleAuthState(state)) {
      res.redirect(`${CLIENT_ORIGIN}/account?error=google_invalid_response`)
      return
    }

    try {
      const identity = await verifyGoogleIdentity(code)
      const user = await findOrCreateGoogleUser(identity)
      const token = signUserToken(user.id)
      res.redirect(`${CLIENT_ORIGIN}/account?token=${token}`)
    } catch (err) {
      if (err instanceof GoogleAuthError) {
        res.redirect(`${CLIENT_ORIGIN}/account?error=google_auth_failed`)
        return
      }
      throw err
    }
  }),
)
