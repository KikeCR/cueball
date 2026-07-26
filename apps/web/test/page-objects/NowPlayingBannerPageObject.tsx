import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { QueueItem } from "@cueball/shared"
import { NowPlayingBanner } from "../../components/NowPlayingBanner"

interface NowPlayingBannerProps {
  item: QueueItem | null
  canMarkPlayed?: boolean
  onMarkPlayed?: () => Promise<void>
}

export class NowPlayingBannerPageObject {
  private user = userEvent.setup()

  constructor(props: NowPlayingBannerProps) {
    render(<NowPlayingBanner {...props} />)
  }

  get link() {
    return screen.queryByRole("link")
  }

  get markPlayedButton() {
    return screen.queryByRole("button", { name: /mark as played/i })
  }

  async clickMarkPlayed() {
    if (!this.markPlayedButton) throw new Error("Mark as played button is not rendered")
    await this.user.click(this.markPlayedButton)
  }
}
