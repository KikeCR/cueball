import { beforeEach, describe, expect, it, vi } from "vitest"
import { AddVideoFormPageObject } from "../../test/page-objects/AddVideoFormPageObject"

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
    const form = new AddVideoFormPageObject()

    await form.fillLink("https://youtu.be/dQw4w9WgXcQ")
    await form.submit()

    expect(addToQueueMock).toHaveBeenCalledWith("https://youtu.be/dQw4w9WgXcQ")
    expect(form.linkInput).toHaveValue("")
  })

  it("shows an error and keeps the input when the server rejects the link", async () => {
    addToQueueMock.mockRejectedValue(new Error("Couldn't find that video"))
    const form = new AddVideoFormPageObject()

    await form.fillLink("https://youtu.be/bad")
    await form.submit()

    expect(await form.findErrorAlert()).toHaveTextContent(
      "Couldn't find that video",
    )
    expect(form.linkInput).toHaveValue("https://youtu.be/bad")
  })
})
