"use client";

import { useState, type FormEvent } from "react";
import { useRoom } from "../../context/RoomContext";

export function JoinRoomForm() {
  const { joinAsGuest, joinError } = useRoom();
  const [guestName, setGuestName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!guestName.trim()) return;

    setSubmitting(true);
    try {
      await joinAsGuest(guestName.trim());
    } catch {
      // joinError from context already reflects the failure
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Your name
        <input
          value={guestName}
          onChange={(event) => setGuestName(event.target.value)}
          maxLength={40}
          required
        />
      </label>
      {joinError && <p role="alert">{joinError}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? "Joining…" : "Join room"}
      </button>
    </form>
  );
}
