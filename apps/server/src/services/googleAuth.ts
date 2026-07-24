import { google } from "googleapis"

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ""
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? ""
const REDIRECT_URI =
  process.env.GOOGLE_AUTH_REDIRECT_URI ??
  "http://localhost:4000/api/auth/google/callback"

// Identity only, not API access, so no offline/refresh token is requested.
const SCOPES = ["openid", "email", "profile"]

export function isGoogleAuthConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET)
}

function createOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
}

export function getGoogleAuthConsentUrl(state: string): string {
  return createOAuthClient().generateAuthUrl({
    scope: SCOPES,
    state,
  })
}

export interface GoogleIdentity {
  email: string
  displayName: string
}

export class GoogleAuthError extends Error {}

/** Exchanges an auth code for a verified Google identity (email + name). */
export async function verifyGoogleIdentity(
  code: string,
): Promise<GoogleIdentity> {
  const client = createOAuthClient()
  const { tokens } = await client.getToken(code)
  if (!tokens.id_token) {
    throw new GoogleAuthError("Google did not return an identity token")
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: CLIENT_ID,
  })
  const payload = ticket.getPayload()
  if (!payload?.email) {
    throw new GoogleAuthError("Google did not return an email address")
  }
  if (!payload.email_verified) {
    throw new GoogleAuthError("Google account email is not verified")
  }

  return {
    email: payload.email.toLowerCase(),
    displayName: payload.name ?? payload.email,
  }
}
