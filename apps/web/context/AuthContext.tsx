"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import type { AuthResponse, AuthUser } from "@cueball/shared"
import { api } from "../api/client"
import {
  clearUserToken,
  getStoredUserToken,
  storeUserToken,
} from "../utils/authSession"

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  loading: boolean
  register: (email: string, password: string, displayName: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  /** Adopts a token issued out-of-band, e.g. redirected back from Google sign-in. */
  applyToken: (token: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = getStoredUserToken()
    if (!stored) {
      setLoading(false)
      return
    }
    api
      .get<{ user: AuthUser }>("/api/auth/me", stored)
      .then((data) => {
        setUser(data.user)
        setToken(stored)
      })
      .catch(() => clearUserToken())
      .finally(() => setLoading(false))
  }, [])

  const applyToken = useCallback(async (newToken: string) => {
    const data = await api.get<{ user: AuthUser }>("/api/auth/me", newToken)
    storeUserToken(newToken)
    setToken(newToken)
    setUser(data.user)
  }, [])

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const data = await api.post<AuthResponse>("/api/auth/register", {
        email,
        password,
        displayName,
      })
      storeUserToken(data.token)
      setToken(data.token)
      setUser(data.user)
    },
    [],
  )

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<AuthResponse>("/api/auth/login", {
      email,
      password,
    })
    storeUserToken(data.token)
    setToken(data.token)
    setUser(data.user)
  }, [])

  const logout = useCallback(() => {
    clearUserToken()
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, token, loading, register, login, applyToken, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
