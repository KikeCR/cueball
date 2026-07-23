"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

export type Theme = "light" | "dark"

const STORAGE_KEY = "theme"

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark")
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Starts at a fixed value so the first client render matches the server;
  // the real theme (stored choice, else OS preference) is resolved after
  // mount. The inline script in layout.tsx already applied the right class
  // before paint, so this doesn't cause a visible flash — it just brings
  // React's own state in sync with what's already on screen.
  const [theme, setTheme] = useState<Theme>("light")

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const initial: Theme =
      stored === "light" || stored === "dark"
        ? stored
        : media.matches
          ? "dark"
          : "light"
    setTheme(initial)
    applyTheme(initial)

    // Until the user makes an explicit choice, keep following the OS theme.
    const handleSystemChange = (event: MediaQueryListEvent) => {
      if (window.localStorage.getItem(STORAGE_KEY)) return
      const next: Theme = event.matches ? "dark" : "light"
      setTheme(next)
      applyTheme(next)
    }
    media.addEventListener("change", handleSystemChange)
    return () => media.removeEventListener("change", handleSystemChange)
  }, [])

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark"
      applyTheme(next)
      window.localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
