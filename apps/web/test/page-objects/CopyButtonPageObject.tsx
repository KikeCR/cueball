import { act, fireEvent, render, screen } from "@testing-library/react"
import { CopyButton } from "../../components/CopyButton"

interface CopyButtonProps {
  value: string
  label?: string
}

export class CopyButtonPageObject {
  constructor(props: CopyButtonProps) {
    render(<CopyButton {...props} />)
  }

  get button() {
    return screen.getByRole("button")
  }

  get accessibleName() {
    return this.button.getAttribute("aria-label")
  }

  // fireEvent+act instead of userEvent.click: userEvent silently never
  // triggers this component's handler in tests, for reasons that weren't
  // fully diagnosed. This is the confirmed working workaround.
  async click() {
    await act(async () => {
      fireEvent.click(this.button)
    })
  }

  findByAccessibleName(name: string, options?: { timeout?: number }) {
    return screen.findByRole("button", { name }, options)
  }
}
