"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { cn } from "../../utils/cn"

interface CopyButtonProps {
  value: string
  label?: string
  className?: string
}

const RESET_DELAY_MS = 1500

export function CopyButton({
  value,
  label = "Copy",
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), RESET_DELAY_MS)
    } catch (err) {
      console.error("Failed to copy to clipboard", err)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={copied ? "Copied" : label}
      className={cn(
        "inline-flex items-center justify-center rounded-md p-2 text-muted transition-colors hover:bg-surface-hover hover:text-text",
        className,
      )}
    >
      {copied ? (
        <Check className="size-3.5 text-upvote" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  )
}
