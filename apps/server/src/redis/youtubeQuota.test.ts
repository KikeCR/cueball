import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./client.js", () => ({
  redis: {
    get: vi.fn(),
    incrby: vi.fn(),
    expire: vi.fn(),
  },
}))

import { redis } from "./client.js"
import {
  getYoutubeQuotaUsage,
  isRelatedVideosQuotaHealthy,
  recordYoutubeQuotaUsage,
} from "./youtubeQuota.js"

describe("youtubeQuota", () => {
  beforeEach(() => {
    vi.mocked(redis.get).mockReset()
    vi.mocked(redis.incrby).mockReset()
    vi.mocked(redis.expire).mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-28T12:00:00-07:00"))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it("increments and refreshes the expiry for today's Pacific-date bucket", async () => {
    await recordYoutubeQuotaUsage(100)

    expect(redis.incrby).toHaveBeenCalledWith("youtube-quota:2026-07-28", 100)
    expect(redis.expire).toHaveBeenCalledWith(
      "youtube-quota:2026-07-28",
      60 * 60 * 30,
    )
  })

  it("buckets by Pacific date, not UTC date, near the day boundary", async () => {
    // 11pm Pacific on the 28th is already the 29th in UTC.
    vi.setSystemTime(new Date("2026-07-28T23:00:00-07:00"))
    await recordYoutubeQuotaUsage(1)
    expect(redis.incrby).toHaveBeenCalledWith("youtube-quota:2026-07-28", 1)
  })

  it("returns 0 usage when nothing has been recorded yet", async () => {
    vi.mocked(redis.get).mockResolvedValue(null)
    expect(await getYoutubeQuotaUsage()).toBe(0)
  })

  it("returns the parsed usage count", async () => {
    vi.mocked(redis.get).mockResolvedValue("4200")
    expect(await getYoutubeQuotaUsage()).toBe(4200)
  })

  it("is healthy below the 70% threshold", async () => {
    vi.mocked(redis.get).mockResolvedValue("6999")
    expect(await isRelatedVideosQuotaHealthy()).toBe(true)
  })

  it("is unhealthy at or above the 70% threshold", async () => {
    vi.mocked(redis.get).mockResolvedValue("7000")
    expect(await isRelatedVideosQuotaHealthy()).toBe(false)
  })

  it("respects a configured daily quota override", async () => {
    vi.stubEnv("YOUTUBE_DAILY_QUOTA_UNITS", "1000")
    vi.mocked(redis.get).mockResolvedValue("699")
    expect(await isRelatedVideosQuotaHealthy()).toBe(true)

    vi.mocked(redis.get).mockResolvedValue("700")
    expect(await isRelatedVideosQuotaHealthy()).toBe(false)
  })
})
