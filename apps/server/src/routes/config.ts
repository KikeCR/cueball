import { Router } from "express"
import type { ConfigResponse } from "@cueball/shared"
import { DEFAULT_ROOM_EXPIRY_HOURS } from "../services/roomService.js"

export const configRouter = Router()

configRouter.get("/config", (_req, res) => {
  res.json({
    roomExpiryHours: DEFAULT_ROOM_EXPIRY_HOURS,
  } satisfies ConfigResponse)
})
