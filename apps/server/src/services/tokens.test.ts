import jwt from "jsonwebtoken"
import { describe, expect, it } from "vitest"
import {
  signGoogleAuthState,
  signParticipantToken,
  signUserToken,
  signYoutubeOAuthState,
  verifyGoogleAuthState,
  verifyParticipantToken,
  verifyUserToken,
  verifyYoutubeOAuthState,
} from "./tokens.js"

describe("participant token", () => {
  it("round-trips the participant and room id", () => {
    const token = signParticipantToken("participant-1", "room-1")
    expect(verifyParticipantToken(token)).toEqual({
      participantId: "participant-1",
      roomId: "room-1",
    })
  })

  it("rejects garbage input", () => {
    expect(verifyParticipantToken("not-a-jwt")).toBeNull()
  })

  it("rejects a token signed with a different secret", () => {
    const forged = jwt.sign(
      { type: "participant", participantId: "attacker", roomId: "room-1" },
      "some-other-secret",
    )
    expect(verifyParticipantToken(forged)).toBeNull()
  })

  it("rejects a token of the wrong type (e.g. an OAuth state token)", () => {
    const stateToken = signYoutubeOAuthState("room-1")
    expect(verifyParticipantToken(stateToken)).toBeNull()
  })
})

describe("user token", () => {
  it("round-trips the user id", () => {
    const token = signUserToken("user-1")
    expect(verifyUserToken(token)).toEqual({ userId: "user-1" })
  })

  it("rejects garbage input", () => {
    expect(verifyUserToken("not-a-jwt")).toBeNull()
  })

  it("rejects a token of the wrong type (e.g. a participant token)", () => {
    const participantToken = signParticipantToken("participant-1", "room-1")
    expect(verifyUserToken(participantToken)).toBeNull()
  })
})

describe("Google auth state token", () => {
  it("accepts a freshly signed state", () => {
    expect(verifyGoogleAuthState(signGoogleAuthState())).toBe(true)
  })

  it("rejects garbage input", () => {
    expect(verifyGoogleAuthState("not-a-jwt")).toBe(false)
  })

  it("rejects a token of the wrong type (e.g. a participant token)", () => {
    const participantToken = signParticipantToken("participant-1", "room-1")
    expect(verifyGoogleAuthState(participantToken)).toBe(false)
  })
})

describe("YouTube OAuth state token", () => {
  it("round-trips the room id", () => {
    const state = signYoutubeOAuthState("room-42")
    expect(verifyYoutubeOAuthState(state)).toEqual({ roomId: "room-42" })
  })

  it("rejects garbage input", () => {
    expect(verifyYoutubeOAuthState("not-a-jwt")).toBeNull()
  })

  it("rejects a token of the wrong type (e.g. a participant token)", () => {
    const participantToken = signParticipantToken("participant-1", "room-1")
    expect(verifyYoutubeOAuthState(participantToken)).toBeNull()
  })
})
