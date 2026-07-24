"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { useAuth } from "../../context/AuthContext"
import { LoginForm } from "../../components/LoginForm"
import { RegisterForm } from "../../components/RegisterForm"
import { GoogleAuthButton } from "../../components/GoogleAuthButton"
import { RoomHistoryList } from "../../components/RoomHistoryList"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"

type Tab = "login" | "register"

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up on this server.",
  google_invalid_response: "That Google sign-in link expired. Please try again.",
  google_auth_failed: "Google sign-in failed. Please try again.",
}

export default function AccountPage() {
  const { user, loading, applyToken, logout } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>("login")
  const [exchangingToken, setExchangingToken] = useState(false)
  const [googleError, setGoogleError] = useState<string | null>(null)

  useEffect(() => {
    const token = searchParams.get("token")
    const error = searchParams.get("error")
    if (!token && !error) return

    if (error) {
      setGoogleError(GOOGLE_ERROR_MESSAGES[error] ?? "Google sign-in failed.")
    }
    if (token) {
      setExchangingToken(true)
      applyToken(token)
        .catch(() => setGoogleError("Google sign-in failed. Please try again."))
        .finally(() => setExchangingToken(false))
    }
    router.replace("/account")
    // Only ever needs to run once, right after a redirect back from Google.
  }, [])

  if (loading || exchangingToken) return null

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 py-12 sm:py-16">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-text"
        >
          <ArrowLeft className="size-3.5" /> Back to home
        </Link>
        <Card className="flex flex-col gap-4">
          <div className="flex gap-1 rounded-md bg-surface-hover p-1">
            <button
              type="button"
              onClick={() => setTab("login")}
              className={`h-9 flex-1 rounded-md text-sm font-semibold transition-colors ${
                tab === "login" ? "bg-surface text-text" : "text-muted"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setTab("register")}
              className={`h-9 flex-1 rounded-md text-sm font-semibold transition-colors ${
                tab === "register" ? "bg-surface text-text" : "text-muted"
              }`}
            >
              Create account
            </button>
          </div>
          {googleError && (
            <p role="alert" className="text-sm text-danger">
              {googleError}
            </p>
          )}
          {tab === "login" ? (
            <LoginForm onSuccess={() => router.push("/account")} />
          ) : (
            <RegisterForm onSuccess={() => router.push("/account")} />
          )}
          <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-muted">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <GoogleAuthButton />
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:py-16">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-text"
      >
        <ArrowLeft className="size-3.5" /> Back to home
      </Link>
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-2">
          <h1 className="text-lg font-bold">{user.displayName}</h1>
          <p className="text-sm text-muted">{user.email}</p>
          <Button variant="ghost" onClick={logout} className="mt-2 self-start">
            Sign out
          </Button>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted">
            Your rooms
          </h2>
          <RoomHistoryList />
        </Card>
      </div>
    </main>
  )
}
