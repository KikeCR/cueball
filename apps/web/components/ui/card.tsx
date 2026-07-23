import type { HTMLAttributes } from "react"
import { cn } from "../../utils/cn"

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-6 shadow-sm shadow-black/5",
        className,
      )}
      {...props}
    />
  )
}
