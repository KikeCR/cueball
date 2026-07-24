"use client"

import { useState, type FormEvent } from "react"
import { Loader2 } from "lucide-react"
import { useAuth } from "../../context/AuthContext"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"

interface FieldErrors {
  email?: string
  password?: string
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-xs font-normal text-danger">
      {message}
    </p>
  )
}

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const { login } = useAuth()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}
    if (!email.trim()) errors.email = "Email is required"
    if (!password) errors.password = "Password is required"
    return errors
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const errors = validate()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    setFormError(null)
    try {
      await login(email.trim(), password)
      onSuccess?.()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to sign in")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <Label>
        Email
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <FieldError message={fieldErrors.email} />
      </Label>
      <Label>
        Password
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <FieldError message={fieldErrors.password} />
      </Label>
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={submitting}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  )
}
