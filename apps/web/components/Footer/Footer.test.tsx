import { describe, expect, it } from "vitest"
import { FooterPageObject } from "../../test/page-objects/FooterPageObject"

describe("Footer", () => {
  it("renders the current year and copyright name", () => {
    const footer = new FooterPageObject()
    expect(footer.copyrightText).toContain(String(new Date().getFullYear()))
    expect(footer.copyrightText).toContain("Luis Barrantes")
  })

  it("links to GitHub and LinkedIn", () => {
    const footer = new FooterPageObject()
    expect(footer.githubLink.href).toBe("https://github.com/KikeCR")
    expect(footer.linkedInLink.href).toBe(
      "https://www.linkedin.com/in/luis-enrique-barrantes/",
    )
  })

  it("opens both links in a new tab safely", () => {
    const footer = new FooterPageObject()
    for (const link of [footer.githubLink, footer.linkedInLink]) {
      expect(link).toHaveAttribute("target", "_blank")
      expect(link).toHaveAttribute("rel", "noopener noreferrer")
    }
  })
})
