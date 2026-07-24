import Link from "next/link"
import { CircleDot } from "lucide-react"
import { cn } from "../../utils/cn"

interface LogoProps {
  className?: string
}

/** The CueBall brand mark, linking home. Shown in the site header on every page. */
export function Logo({ className }: LogoProps) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2 text-text transition-opacity hover:opacity-80",
        className,
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-hover shadow-sm">
        <CircleDot className="size-4 text-primary-foreground" strokeWidth={2.25} />
      </span>
      <span className="text-lg font-bold tracking-tight">CueBall</span>
    </Link>
  )
}
