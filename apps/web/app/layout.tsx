import type { ReactNode } from "react"
import { Inter } from "next/font/google"
import { ThemeProvider } from "../context/ThemeContext"
import { AuthProvider } from "../context/AuthContext"
import { ThemeToggle } from "../components/ThemeToggle"
import { AccountMenu } from "../components/AccountMenu"
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
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>
          <AuthProvider>
            <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
              <AccountMenu />
              <ThemeToggle />
            </div>
            <div className="pt-16">{children}</div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
