import type { Config } from "tailwindcss"

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
  plugins: [],
}

export default config
