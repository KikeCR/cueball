import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

interface ParticipantTokenPayload {
  type: "participant";
  participantId: string;
  roomId: string;
}

export function signParticipantToken(
  participantId: string,
  roomId: string,
): string {
  const payload: ParticipantTokenPayload = {
    type: "participant",
    participantId,
    roomId,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyParticipantToken(
  token: string,
): { participantId: string; roomId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as ParticipantTokenPayload;
    if (decoded.type !== "participant") return null;
    return { participantId: decoded.participantId, roomId: decoded.roomId };
  } catch {
    return null;
  }
}
