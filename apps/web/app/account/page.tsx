"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { useAuth } from "../../context/AuthContext"
import { LoginForm } from "../../components/LoginForm"
import { RegisterForm } from "../../components/RegisterForm"
import { RoomHistoryList } from "../../components/RoomHistoryList"
import { Card } from "../../components/ui/card"
import { Button } from "../../components/ui/button"

type Tab = "login" | "register"

export default function AccountPage() {
  const { user, loading, logout } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("login")

  if (loading) return null

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
          {tab === "login" ? (
            <LoginForm onSuccess={() => router.push("/account")} />
          ) : (
            <RegisterForm onSuccess={() => router.push("/account")} />
          )}
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
