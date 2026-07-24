import type { ReactNode } from "react"
import { Inter } from "next/font/google"
import { ThemeProvider } from "../context/ThemeContext"
import { AuthProvider } from "../context/AuthContext"
import { ThemeToggle } from "../components/ThemeToggle"
import { AccountMenu } from "../components/AccountMenu"
import { Logo } from "../components/Logo"
import { Footer } from "../components/Footer"
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
      <body className="flex min-h-screen flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>
          <AuthProvider>
            <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface/80 px-4 backdrop-blur-sm sm:px-6">
              <Logo />
              <div className="flex items-center gap-2">
                <AccountMenu />
                <ThemeToggle />
              </div>
            </header>
            <div className="flex-1">{children}</div>
            <Footer />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
