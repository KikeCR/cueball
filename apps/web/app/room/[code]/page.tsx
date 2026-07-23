"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { RoomPreview } from "@cueball/shared";
import { api } from "../../../api/client";
import { RoomProvider, useRoom } from "../../../context/RoomContext";
import { JoinRoomForm } from "../../../components/JoinRoomForm";
import { ParticipantList } from "../../../components/ParticipantList";

function RoomView({ roomCode }: { roomCode: string }) {
  const { room, participants, self, connected, reconnecting } = useRoom();
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<RoomPreview>(`/api/rooms/${roomCode}`)
      .then(setPreview)
      .catch((err) =>
        setPreviewError(err instanceof Error ? err.message : "Room not found"),
      );
  }, [roomCode]);

  if (previewError) {
    return <p role="alert">{previewError}</p>;
  }

  const displayName = room?.name ?? preview?.name ?? roomCode;

  if (reconnecting) {
    return <p>Reconnecting…</p>;
  }

  if (!self) {
    return (
      <div>
        <h1>{displayName}</h1>
        {!connected && <p>Connecting…</p>}
        <JoinRoomForm />
      </div>
    );
  }

  return (
    <div>
      <h1>{displayName}</h1>
      <p>Room code: {roomCode}</p>
      <ParticipantList participants={participants} selfId={self.id} />
    </div>
  );
}

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const roomCode = params.code.toUpperCase();

  return (
    <RoomProvider roomCode={roomCode}>
      <RoomView roomCode={roomCode} />
    </RoomProvider>
  );
}
