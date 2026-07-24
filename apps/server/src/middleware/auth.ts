import type { NextFunction, Request, Response } from "express"
import { verifyUserToken } from "../services/tokens.js"

declare module "express-serve-static-core" {
  interface Request {
    userId?: string
  }
}

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith("Bearer ")) return null
  return header.slice("Bearer ".length)
}

/** Attaches req.userId when a valid token is present, but never rejects the request. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = readBearerToken(req)
  const decoded = token ? verifyUserToken(token) : null
  if (decoded) req.userId = decoded.userId
  next()
}

/** Same as optionalAuth, but rejects the request when no valid token is present. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = readBearerToken(req)
  const decoded = token ? verifyUserToken(token) : null
  if (!decoded) {
    res.status(401).json({ error: "Authentication required" })
    return
  }
  req.userId = decoded.userId
  next()
}
