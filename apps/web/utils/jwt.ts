/**
 * Reads the payload of a JWT without verifying its signature. Safe here only
 * because this token was issued to this same client and the worst case of a
 * bad read is a UI misidentifying "you" in the participant list, not a
 * security decision.
 */
export function decodeJwtPayload<T>(token: string): T | null {
  try {
    const payload = token.split(".")[1]
    if (!payload) return null
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    return JSON.parse(json) as T
  } catch {
    return null
  }
}
