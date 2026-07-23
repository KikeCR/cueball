import { google } from "googleapis"
import { prisma } from "./prisma.js"

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ""
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? ""
const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ??
  "http://localhost:4000/api/youtube/callback"

const SCOPES = ["https://www.googleapis.com/auth/youtube"]

export function isYoutubeOAuthConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET)
}

function createOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
}

export function getConsentUrl(state: string): string {
  return createOAuthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  })
}

export interface YoutubeTokens {
  accessToken: string
  refreshToken: string
  expiresAt: Date
}

export async function exchangeCodeForTokens(
  code: string,
): Promise<YoutubeTokens> {
  const client = createOAuthClient()
  const { tokens } = await client.getToken(code)
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke CueBall's access at https://myaccount.google.com/permissions and try connecting again.",
    )
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(tokens.expiry_date ?? Date.now() + 60 * 60 * 1000),
  }
}

interface RoomYoutubeTokens {
  id: string
  youtubeAccessToken: string | null
  youtubeRefreshToken: string | null
  youtubeTokenExpiresAt: Date | null
}

/** Builds a YouTube client for a room's stored tokens; refreshed access tokens are persisted back automatically. */
export function getAuthorizedYoutubeClient(room: RoomYoutubeTokens) {
  if (!room.youtubeAccessToken || !room.youtubeRefreshToken) {
    throw new Error("Room has no YouTube connection")
  }

  const client = createOAuthClient()
  client.setCredentials({
    access_token: room.youtubeAccessToken,
    refresh_token: room.youtubeRefreshToken,
    expiry_date: room.youtubeTokenExpiresAt?.getTime(),
  })

  client.on("tokens", (tokens) => {
    if (!tokens.access_token) return
    void prisma.room
      .update({
        where: { id: room.id },
        data: {
          youtubeAccessToken: tokens.access_token,
          youtubeTokenExpiresAt: tokens.expiry_date
            ? new Date(tokens.expiry_date)
            : null,
          ...(tokens.refresh_token
            ? { youtubeRefreshToken: tokens.refresh_token }
            : {}),
        },
      })
      .catch((err: unknown) => {
        console.error(
          `Failed to persist refreshed YouTube token for room ${room.id}`,
          err,
        )
      })
  })

  return google.youtube({ version: "v3", auth: client })
}
