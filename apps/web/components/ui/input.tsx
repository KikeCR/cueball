import { forwardRef, type InputHTMLAttributes } from "react"
import { cn } from "../../utils/cn"

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 rounded-md border border-border bg-bg px-3 text-sm text-text placeholder:text-muted",
      "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
      className,
    )}
    {...props}
  />
))
Input.displayName = "Input"
