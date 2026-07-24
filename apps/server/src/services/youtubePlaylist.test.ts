import { describe, expect, it } from "vitest"
import { describeYoutubePlaylistError } from "./youtubePlaylist.js"

describe("describeYoutubePlaylistError", () => {
  it("calls out a quota error specifically instead of blaming the connection", () => {
    const err = { errors: [{ reason: "quotaExceeded" }] }
    expect(describeYoutubePlaylistError(err)).toMatch(/daily API limit/i)
  })

  it("treats dailyLimitExceeded the same as quotaExceeded", () => {
    const err = { errors: [{ reason: "dailyLimitExceeded" }] }
    expect(describeYoutubePlaylistError(err)).toMatch(/daily API limit/i)
  })

  it("falls back to a connection-check message for other errors", () => {
    const err = { errors: [{ reason: "forbidden" }] }
    expect(describeYoutubePlaylistError(err)).toMatch(/check their YouTube connection/i)
  })

  it("falls back gracefully when the error has no recognizable shape", () => {
    expect(describeYoutubePlaylistError(new Error("boom"))).toMatch(
      /check their YouTube connection/i,
    )
    expect(describeYoutubePlaylistError(null)).toMatch(
      /check their YouTube connection/i,
    )
    expect(describeYoutubePlaylistError(undefined)).toMatch(
      /check their YouTube connection/i,
    )
  })
})
