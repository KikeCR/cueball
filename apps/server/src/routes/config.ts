import { Router } from "express"
import type { ConfigResponse } from "@cueball/shared"
import { isRelatedVideosQuotaHealthy } from "../redis/youtubeQuota.js"
import { DEFAULT_ROOM_EXPIRY_HOURS } from "../services/roomService.js"

export const configRouter = Router()

configRouter.get("/config", async (_req, res) => {
  res.json({
    roomExpiryHours: DEFAULT_ROOM_EXPIRY_HOURS,
    youtubeQuotaHealthy: await isRelatedVideosQuotaHealthy(),
  } satisfies ConfigResponse)
})
