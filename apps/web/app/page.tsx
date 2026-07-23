"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { CreateRoomForm } from "../components/CreateRoomForm"
import { Card } from "../components/ui/card"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"

export default function HomePage() {
  const router = useRouter()
  const [roomCode, setRoomCode] = useState("")

  const handleJoinByCode = (event: FormEvent) => {
    event.preventDefault()
    const code = roomCode.trim().toUpperCase()
    if (!code) return
    router.push(`/room/${code}`)
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight">🎱 CueBall</h1>
        <p className="mx-auto mt-2 max-w-[40ch] text-muted">
          Queue up YouTube videos with friends and vote on what plays next.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        <Card className="flex flex-col gap-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted">
            Create a room
          </h2>
          <CreateRoomForm />
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted">
            Join a room
          </h2>
          <form className="flex flex-col gap-4" onSubmit={handleJoinByCode}>
            <Label>
              Room code
              <Input
                value={roomCode}
                onChange={(event) =>
                  setRoomCode(event.target.value.toUpperCase())
                }
                maxLength={6}
                placeholder="ABC123"
                className="font-mono tracking-widest"
                required
              />
            </Label>
            <Button type="submit">Join</Button>
          </form>
        </Card>
      </div>
    </main>
  )
}
