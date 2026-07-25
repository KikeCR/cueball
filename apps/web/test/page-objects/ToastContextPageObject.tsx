import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ToastProvider, useToast } from "../../context/ToastContext"

function Probe() {
  const { success, error } = useToast()

  return (
    <div>
      <button onClick={() => success("Video added")}>fire-success</button>
      <button onClick={() => error("Something broke")}>fire-error</button>
    </div>
  )
}

export class ToastContextPageObject {
  private user = userEvent.setup()

  constructor() {
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    )
  }

  async fireSuccess() {
    await this.user.click(screen.getByText("fire-success"))
  }

  async fireError() {
    await this.user.click(screen.getByText("fire-error"))
  }

  findToast(message: string) {
    return screen.findByText(message)
  }

  queryToast(message: string) {
    return screen.queryByText(message)
  }

  async dismiss(message: string) {
    const toast = await this.findToast(message)
    const alert = toast.closest('[role="alert"]') as HTMLElement
    await this.user.click(within(alert).getByRole("button", { name: "Dismiss" }))
  }
}
