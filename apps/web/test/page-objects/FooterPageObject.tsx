import { render, screen } from "@testing-library/react"
import { Footer } from "../../components/Footer"

export class FooterPageObject {
  constructor() {
    render(<Footer />)
  }

  get copyrightText() {
    return screen.getByText(/built with care/i).textContent ?? ""
  }

  get githubLink() {
    return screen.getByRole("link", { name: "GitHub" }) as HTMLAnchorElement
  }

  get linkedInLink() {
    return screen.getByRole("link", { name: "LinkedIn" }) as HTMLAnchorElement
  }

  get privacyLink() {
    return screen.getByRole("link", { name: "Privacy" }) as HTMLAnchorElement
  }

  get termsLink() {
    return screen.getByRole("link", { name: "Terms" }) as HTMLAnchorElement
  }
}
