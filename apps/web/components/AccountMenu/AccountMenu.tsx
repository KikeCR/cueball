"use client"

import Link from "next/link"
import { LogOut, User } from "lucide-react"
import { useAuth } from "../../context/AuthContext"
import { Spinner } from "../ui/spinner"

export function AccountMenu() {
  const { user, loading, logout } = useAuth()

  if (loading) {
    // Same footprint as the "Sign in" pill below, so there's no layout
    // shift once the real state settles — just a blank gap here would be
    // easy to miss on a fast connection, but a cold app-launch (e.g. an
    // iOS home-screen icon, which has no cached JS bundle to warm up from)
    // can leave this loading for long enough to be noticeable.
    return (
      <div
        aria-label="Loading account"
        className="inline-flex h-9 items-center justify-center rounded-full border border-border bg-surface px-3"
      >
        <Spinner className="size-3.5 text-muted" />
      </div>
    )
  }

  if (!user) {
    return (
      <Link
        href="/account"
        className="inline-flex h-9 items-center rounded-full border border-border bg-surface px-3 text-xs font-semibold text-text transition-colors hover:bg-surface-hover"
      >
        Sign in
      </Link>
    )
  }

  return (
    <div className="inline-flex h-9 items-center gap-1 rounded-full border border-border bg-surface pl-3 pr-1 text-xs font-semibold text-text">
      <Link href="/account" className="inline-flex items-center gap-1.5">
        <User className="size-3.5 text-muted" />
        {user.displayName}
      </Link>
      <button
        type="button"
        onClick={logout}
        aria-label="Sign out"
        title="Sign out"
        className="inline-flex size-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover"
      >
        <LogOut className="size-3.5" />
      </button>
    </div>
  )
}
