import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AddVideoForm } from "./AddVideoForm"

const addToQueueMock = vi.fn()

vi.mock("../../context/RoomContext", () => ({
  useRoom: () => ({ addToQueue: addToQueueMock }),
}))

describe("AddVideoForm", () => {
  beforeEach(() => {
    addToQueueMock.mockReset()
  })

  it("submits the pasted link and clears the input", async () => {
    addToQueueMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<AddVideoForm />)

    const input = screen.getByLabelText("YouTube link")
    await user.type(input, "https://youtu.be/dQw4w9WgXcQ")
    await user.click(screen.getByRole("button", { name: /^add$/i }))

    expect(addToQueueMock).toHaveBeenCalledWith("https://youtu.be/dQw4w9WgXcQ")
    expect(input).toHaveValue("")
  })

  it("shows an error and keeps the input when the server rejects the link", async () => {
    addToQueueMock.mockRejectedValue(new Error("Couldn't find that video"))
    const user = userEvent.setup()
    render(<AddVideoForm />)

    const input = screen.getByLabelText("YouTube link")
    await user.type(input, "https://youtu.be/bad")
    await user.click(screen.getByRole("button", { name: /^add$/i }))

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't find that video",
    )
    expect(input).toHaveValue("https://youtu.be/bad")
  })
})
