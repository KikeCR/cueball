"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { CheckCircle2, X, XCircle } from "lucide-react"
import { cn } from "../../utils/cn"

export type ToastVariant = "success" | "error"

export interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastStackProps {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  // Portals need a browser document; bail out until after mount so this
  // stays inert during SSR.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || toasts.length === 0) return null

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className={cn(
            "flex items-center gap-2.5 rounded-md border border-border bg-surface py-2.5 pl-3 pr-2.5 text-sm text-text shadow-lg shadow-black/10",
            "border-l-4",
            toast.variant === "error" ? "border-l-danger" : "border-l-upvote",
          )}
        >
          {toast.variant === "error" ? (
            <XCircle className="size-4 shrink-0 text-danger" />
          ) : (
            <CheckCircle2 className="size-4 shrink-0 text-upvote" />
          )}
          <span className="flex-1 font-medium">{toast.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 rounded-sm p-0.5 text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
