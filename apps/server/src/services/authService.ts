import bcrypt from "bcrypt"
import type { User } from "@prisma/client"
import { prisma } from "./prisma.js"

const SALT_ROUNDS = 10

export class AuthError extends Error {}

export async function registerUser(params: {
  email: string
  password: string
  displayName: string
}): Promise<User> {
  const existing = await prisma.user.findUnique({
    where: { email: params.email },
  })
  if (existing) throw new AuthError("An account with this email already exists")

  const passwordHash = await bcrypt.hash(params.password, SALT_ROUNDS)
  return prisma.user.create({
    data: {
      email: params.email,
      passwordHash,
      displayName: params.displayName,
    },
  })
}

export async function loginUser(params: {
  email: string
  password: string
}): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email: params.email } })
  if (!user || !user.passwordHash) {
    throw new AuthError("Invalid email or password")
  }
  const valid = await bcrypt.compare(params.password, user.passwordHash)
  if (!valid) throw new AuthError("Invalid email or password")
  return user
}

export async function getUserById(userId: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id: userId } })
}

/** Signs in an existing account by email, or creates a passwordless one for a first-time Google login. */
export async function findOrCreateGoogleUser(params: {
  email: string
  displayName: string
}): Promise<User> {
  const existing = await prisma.user.findUnique({
    where: { email: params.email },
  })
  if (existing) return existing

  return prisma.user.create({
    data: { email: params.email, displayName: params.displayName },
  })
}
