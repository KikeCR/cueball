import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateRoomForm } from "./CreateRoomForm";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("../../api/client", () => ({
  api: { post: vi.fn() },
}));

import { api } from "../../api/client";

describe("CreateRoomForm", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.mocked(api.post).mockReset();
    localStorage.clear();
  });

  it("creates a room, stores the participant token, and navigates to it", async () => {
    vi.mocked(api.post).mockResolvedValue({
      room: {
        id: "r1",
        code: "ABC123",
        name: null,
        hostUserId: null,
        controllerId: "p1",
        currentTrackId: null,
        playbackState: "PAUSED",
        playbackPosition: 0,
        createdAt: new Date().toISOString(),
      },
      participant: {
        id: "p1",
        roomId: "r1",
        userId: null,
        guestName: "Sam",
        isHost: true,
        joinedAt: new Date().toISOString(),
        connected: true,
      },
      participantToken: "token-123",
    });

    const user = userEvent.setup();
    render(<CreateRoomForm />);

    await user.type(screen.getByLabelText("Your name"), "Sam");
    await user.click(screen.getByRole("button", { name: /create room/i }));

    expect(api.post).toHaveBeenCalledWith("/api/rooms", {
      hostName: "Sam",
      roomName: undefined,
    });
    expect(localStorage.getItem("cueball:room:ABC123")).toContain("token-123");
    expect(pushMock).toHaveBeenCalledWith("/room/ABC123");
  });

  it("shows an error if room creation fails", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("Server unavailable"));

    const user = userEvent.setup();
    render(<CreateRoomForm />);

    await user.type(screen.getByLabelText("Your name"), "Sam");
    await user.click(screen.getByRole("button", { name: /create room/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Server unavailable",
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});
