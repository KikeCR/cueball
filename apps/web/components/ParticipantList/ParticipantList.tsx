import type { ParticipantWithPresence } from "@cueball/shared";

interface ParticipantListProps {
  participants: ParticipantWithPresence[];
  selfId: string | null;
}

export function ParticipantList({
  participants,
  selfId,
}: ParticipantListProps) {
  if (participants.length === 0) {
    return <p>No one here yet.</p>;
  }

  return (
    <ul>
      {participants.map((participant) => (
        <li key={participant.id}>
          <span
            aria-label={participant.connected ? "connected" : "disconnected"}
          >
            {participant.connected ? "🟢" : "⚪"}
          </span>{" "}
          {participant.guestName ?? "Guest"}
          {participant.isHost ? " (host)" : ""}
          {participant.id === selfId ? " (you)" : ""}
        </li>
      ))}
    </ul>
  );
}
