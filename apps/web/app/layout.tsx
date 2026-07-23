import type { ReactNode } from "react"
import { Inter } from "next/font/google"
import { ThemeProvider } from "../context/ThemeContext"
import { ThemeToggle } from "../components/ThemeToggle"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

export const metadata = {
  title: "CueBall",
  description: "Shared watch-party queue for YouTube",
}

// Runs before hydration so the correct theme class is on <html> for the
// very first paint — otherwise a device in dark mode would flash light
// until ThemeProvider's effect catches up after mount.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var isDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>
          <div className="fixed right-4 top-4 z-50">
            <ThemeToggle />
          </div>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
