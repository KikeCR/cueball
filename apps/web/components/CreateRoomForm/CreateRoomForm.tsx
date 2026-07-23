"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CreateRoomRequest, CreateRoomResponse } from "@cueball/shared";
import { api } from "../../api/client";
import { storeParticipantToken } from "../../utils/participantSession";

export function CreateRoomForm() {
  const router = useRouter();
  const [hostName, setHostName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedHostName = hostName.trim();
    if (!trimmedHostName) return;

    setSubmitting(true);
    setError(null);
    try {
      const request: CreateRoomRequest = {
        hostName: trimmedHostName,
        roomName: roomName.trim() || undefined,
      };
      const response = await api.post<CreateRoomResponse>(
        "/api/rooms",
        request,
      );
      storeParticipantToken(response.room.code, response.participantToken);
      router.push(`/room/${response.room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Your name
        <input
          value={hostName}
          onChange={(event) => setHostName(event.target.value)}
          maxLength={40}
          required
        />
      </label>
      <label>
        Room name (optional)
        <input
          value={roomName}
          onChange={(event) => setRoomName(event.target.value)}
          maxLength={80}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create room"}
      </button>
    </form>
  );
}
