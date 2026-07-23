import type { HTMLAttributes } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../utils/cn"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-surface-hover text-muted",
        primary: "bg-primary/15 text-primary",
      },
    },
    defaultVariants: { variant: "default" },
  },
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}
