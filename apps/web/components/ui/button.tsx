import { forwardRef, type ButtonHTMLAttributes } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../utils/cn"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        ghost:
          "bg-transparent border border-border text-text hover:bg-surface-hover",
        icon: "bg-transparent border border-border text-muted hover:bg-surface-hover",
      },
      size: {
        default: "h-11 px-4 text-sm",
        sm: "h-9 px-3 text-xs",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
)
Button.displayName = "Button"
