import { Github, Linkedin } from "lucide-react"

const GITHUB_URL = "https://github.com/KikeCR"
const LINKEDIN_URL = "https://www.linkedin.com/in/luis-enrique-barrantes/"

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border py-6 text-muted">
      <div className="flex flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
        <p className="text-xs">&copy; {year} Luis Barrantes. Built with care.</p>
        <div className="flex items-center gap-4">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
          >
            <Github className="size-5 transition-colors hover:text-text" />
          </a>
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
          >
            <Linkedin className="size-5 transition-colors hover:text-text" />
          </a>
        </div>
      </div>
    </footer>
  )
}
