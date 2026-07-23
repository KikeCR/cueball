import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"

// jsdom doesn't implement matchMedia, which ThemeContext reads to detect
// the OS color-scheme preference.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}

afterEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove("dark")
})
