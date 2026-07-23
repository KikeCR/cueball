"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CreateRoomForm } from "../components/CreateRoomForm";

export default function HomePage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");

  const handleJoinByCode = (event: FormEvent) => {
    event.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code) return;
    router.push(`/room/${code}`);
  };

  return (
    <main>
      <h1>CueBall</h1>

      <section>
        <h2>Create a room</h2>
        <CreateRoomForm />
      </section>

      <section>
        <h2>Join a room</h2>
        <form onSubmit={handleJoinByCode}>
          <label>
            Room code
            <input
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value)}
              maxLength={6}
              required
            />
          </label>
          <button type="submit">Join</button>
        </form>
      </section>
    </main>
  );
}
