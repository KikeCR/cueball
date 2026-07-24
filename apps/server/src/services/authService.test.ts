import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}))

import bcrypt from "bcrypt"
import { prisma } from "./prisma.js"
import {
  AuthError,
  findOrCreateGoogleUser,
  getUserById,
  loginUser,
  registerUser,
} from "./authService.js"

const EXISTING_USER = {
  id: "user-1",
  email: "sam@example.com",
  passwordHash: "hashed",
  displayName: "Sam",
  createdAt: new Date(),
}

beforeEach(() => {
  vi.mocked(prisma.user.findUnique).mockReset()
  vi.mocked(prisma.user.create).mockReset()
  vi.mocked(bcrypt.hash).mockReset()
  vi.mocked(bcrypt.compare).mockReset()
})

describe("registerUser", () => {
  it("hashes the password and creates a user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    vi.mocked(bcrypt.hash).mockResolvedValue("hashed-password" as never)
    vi.mocked(prisma.user.create).mockResolvedValue(EXISTING_USER as never)

    const user = await registerUser({
      email: "sam@example.com",
      password: "password123",
      displayName: "Sam",
    })

    expect(bcrypt.hash).toHaveBeenCalledWith("password123", 10)
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: "sam@example.com",
        passwordHash: "hashed-password",
        displayName: "Sam",
      },
    })
    expect(user).toEqual(EXISTING_USER)
  })

  it("rejects when the email is already taken", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(EXISTING_USER as never)

    await expect(
      registerUser({
        email: "sam@example.com",
        password: "password123",
        displayName: "Sam",
      }),
    ).rejects.toThrow(AuthError)
    expect(prisma.user.create).not.toHaveBeenCalled()
  })
})

describe("loginUser", () => {
  it("returns the user when the password matches", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(EXISTING_USER as never)
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)

    const user = await loginUser({
      email: "sam@example.com",
      password: "password123",
    })

    expect(bcrypt.compare).toHaveBeenCalledWith("password123", "hashed")
    expect(user).toEqual(EXISTING_USER)
  })

  it("rejects when no account exists for the email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    await expect(
      loginUser({ email: "nobody@example.com", password: "password123" }),
    ).rejects.toThrow(AuthError)
  })

  it("rejects when the password is wrong", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(EXISTING_USER as never)
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)

    await expect(
      loginUser({ email: "sam@example.com", password: "wrong" }),
    ).rejects.toThrow(AuthError)
  })
})

describe("getUserById", () => {
  it("returns null when the user doesn't exist", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    expect(await getUserById("missing")).toBeNull()
  })
})

describe("findOrCreateGoogleUser", () => {
  it("returns the existing account when the email already has one", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(EXISTING_USER as never)

    const user = await findOrCreateGoogleUser({
      email: "sam@example.com",
      displayName: "Sam From Google",
    })

    expect(user).toEqual(EXISTING_USER)
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it("creates a passwordless account on first Google sign-in", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.user.create).mockResolvedValue(EXISTING_USER as never)

    await findOrCreateGoogleUser({
      email: "new@example.com",
      displayName: "New Person",
    })

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: "new@example.com", displayName: "New Person" },
    })
  })
})
