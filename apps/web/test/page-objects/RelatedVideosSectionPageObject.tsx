import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RelatedVideosSection } from "../../components/RelatedVideosSection"

export class RelatedVideosSectionPageObject {
  private user = userEvent.setup()

  constructor() {
    render(<RelatedVideosSection />)
  }

  get refreshButton() {
    return screen.getByRole("button", { name: /refresh/i })
  }

  get emptyStateText() {
    return screen.queryByText(/no related videos yet/i)
  }

  async clickRefresh() {
    await this.user.click(this.refreshButton)
  }

  queryResultButton(title: string) {
    return screen.queryByRole("button", { name: new RegExp(`^Add ${title}`, "i") })
  }

  async clickResult(title: string) {
    const button = this.queryResultButton(title)
    if (!button) throw new Error(`No related-video button for "${title}"`)
    await this.user.click(button)
  }
}
