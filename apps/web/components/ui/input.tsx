import { forwardRef, type InputHTMLAttributes } from "react"
import { cn } from "../../utils/cn"

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      // text-base (16px), not text-sm: iOS Safari auto-zooms the page on
      // focus for any input rendering below 16px, which felt like a bug to
      // users typing into these fields on a phone.
      "h-11 rounded-md border border-border bg-bg px-3 text-base text-text placeholder:text-muted",
      "focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
      className,
    )}
    {...props}
  />
))
Input.displayName = "Input"
