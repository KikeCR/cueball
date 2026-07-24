import type { Config } from "tailwindcss"
import plugin from "tailwindcss/plugin"

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        bg: "hsl(var(--bg))",
        surface: "hsl(var(--surface))",
        "surface-hover": "hsl(var(--surface-hover))",
        text: "hsl(var(--text))",
        muted: "hsl(var(--muted))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          hover: "hsl(var(--primary-hover))",
          foreground: "hsl(var(--primary-foreground))",
        },
        danger: "hsl(var(--danger))",
        upvote: "hsl(var(--upvote))",
        downvote: "hsl(var(--downvote))",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "16px",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [
    // Touch devices simulate `:hover` on tap and often leave it "stuck"
    // until the next tap elsewhere, making buttons look permanently
    // highlighted. Gating hover: behind an actual hover-capable pointer
    // fixes every existing hover: utility app-wide, no component changes.
    plugin(({ addVariant }) => {
      addVariant("hover", "@media (hover: hover) { &:hover }")
    }),
  ],
}

export default config
