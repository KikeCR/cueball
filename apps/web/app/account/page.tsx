"use client"

import { Suspense, useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Check, Pencil, X } from "lucide-react"
import { MAX_NAME_LENGTH, MAX_VIDEO_DURATION_SECONDS } from "@cueball/shared"
import { useAuth } from "../../context/AuthContext"
import { useToast } from "../../context/ToastContext"
import { LoginForm } from "../../components/LoginForm"
import { RegisterForm } from "../../components/RegisterForm"
import { GoogleAuthButton } from "../../components/GoogleAuthButton"
import { RoomHistoryList } from "../../components/RoomHistoryList"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"
import { Spinner } from "../../components/ui/spinner"
import { Switch } from "../../components/ui/switch"

type Tab = "login" | "register"

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up on this server.",
  google_invalid_response: "That Google sign-in link expired. Please try again.",
  google_auth_failed: "Google sign-in failed. Please try again.",
}

/**
 * Reads the ?token=/?error= query params from the Google sign-in redirect.
 * Isolated in its own component because useSearchParams() opts the nearest
 * Suspense boundary into client-only rendering, and we don't want that to
 * apply to the whole page, just this one-time redirect check.
 */
function GoogleCallbackHandler({
  onExchangingChange,
}: {
  onExchangingChange: (exchanging: boolean) => void
}) {
  const { applyToken } = useAuth()
  const toast = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const token = searchParams.get("token")
    const error = searchParams.get("error")
    if (!token && !error) return

    if (error) {
      toast.error(GOOGLE_ERROR_MESSAGES[error] ?? "Google sign-in failed.")
    }
    if (token) {
      onExchangingChange(true)
      applyToken(token)
        .catch(() => toast.error("Google sign-in failed. Please try again."))
        .finally(() => onExchangingChange(false))
    }
    router.replace("/account")
    // Only ever needs to run once, right after a redirect back from Google.
  }, [])

  return null
}

export default function AccountPage() {
  const { user, loading, logout, updateSettings } = useAuth()
  const toast = useToast()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("login")
  const [exchangingToken, setExchangingToken] = useState(false)
  const [editingDisplayName, setEditingDisplayName] = useState<string | null>(
    null,
  )

  const submitDisplayName = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = editingDisplayName?.trim()
    setEditingDisplayName(null)
    if (!trimmed || trimmed === user?.displayName) return
    updateSettings({ displayName: trimmed }).catch((err) =>
      toast.error(
        err instanceof Error ? err.message : "Failed to update name",
      ),
    )
  }

  const handleToggleAllowLongVideos = (allowLongVideos: boolean) => {
    updateSettings({ allowLongVideos }).catch((err) =>
      toast.error(
        err instanceof Error ? err.message : "Failed to update setting",
      ),
    )
  }

  const handleToggleRelatedVideosBeta = (relatedVideosBetaEnabled: boolean) => {
    updateSettings({ relatedVideosBetaEnabled }).catch((err) =>
      toast.error(
        err instanceof Error ? err.message : "Failed to update setting",
      ),
    )
  }

  const callbackHandler = (
    <Suspense fallback={null}>
      <GoogleCallbackHandler onExchangingChange={setExchangingToken} />
    </Suspense>
  )

  if (loading || exchangingToken) {
    return (
      <main className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        {callbackHandler}
        <Spinner className="size-6 text-primary" />
        <p className="text-sm font-semibold text-muted">
          {exchangingToken ? "Signing you in…" : "Loading…"}
        </p>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 py-12 sm:py-16">
        {callbackHandler}
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
      {callbackHandler}
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-text"
      >
        <ArrowLeft className="size-3.5" /> Back to home
      </Link>
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-2">
          {editingDisplayName !== null ? (
            <form
              onSubmit={submitDisplayName}
              className="flex items-center gap-1.5"
            >
              <input
                autoFocus
                value={editingDisplayName}
                onChange={(event) => setEditingDisplayName(event.target.value)}
                maxLength={MAX_NAME_LENGTH}
                aria-label="Display name"
                className="h-9 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-lg font-bold text-text focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <button
                type="submit"
                aria-label="Save display name"
                className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-upvote/15 hover:text-upvote"
              >
                <Check className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Cancel"
                onClick={() => setEditingDisplayName(null)}
                className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-danger/15 hover:text-danger"
              >
                <X className="size-4" />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-1.5">
              <h1 className="text-lg font-bold">{user.displayName}</h1>
              <button
                type="button"
                aria-label="Edit display name"
                onClick={() => setEditingDisplayName(user.displayName)}
                className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-text"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
          )}
          <p className="text-sm text-muted">{user.email}</p>
          <Button variant="ghost" onClick={logout} className="mt-2 self-start">
            Sign out
          </Button>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Allow long videos</h2>
              <p className="text-xs text-muted">
                Skips the {MAX_VIDEO_DURATION_SECONDS / 60}-minute video
                length limit in rooms you create.
              </p>
            </div>
            <Switch
              checked={user.allowLongVideos}
              onChange={handleToggleAllowLongVideos}
              label="Allow long videos"
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Related videos (beta)</h2>
              <p className="text-xs text-muted">
                Shows a section under the queue suggesting videos related to
                what's been added, with one click to add them. The feature
                might have limited use due to restrictions.
              </p>
            </div>
            <Switch
              checked={user.relatedVideosBetaEnabled}
              onChange={handleToggleRelatedVideosBeta}
              label="Related videos (beta)"
            />
          </div>
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
