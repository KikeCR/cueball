"use client"

import { useState, type FormEvent } from "react"
import { Loader2 } from "lucide-react"
import { MAX_NAME_LENGTH, MIN_PASSWORD_LENGTH } from "@cueball/shared"
import { useAuth } from "../../context/AuthContext"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"

interface FieldErrors {
  displayName?: string
  email?: string
  password?: string
  confirmPassword?: string
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="text-xs font-normal text-danger">
      {message}
    </p>
  )
}

export function RegisterForm({ onSuccess }: { onSuccess?: () => void }) {
  const { register } = useAuth()
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {}
    if (!displayName.trim()) errors.displayName = "Display name is required"
    if (!email.trim()) errors.email = "Email is required"
    else if (!email.includes("@")) errors.email = "Enter a valid email"
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    }
    if (confirmPassword !== password) {
      errors.confirmPassword = "Passwords don't match"
    }
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
      await register(email.trim(), password, displayName.trim())
      onSuccess?.()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create account")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <Label>
        Display name
        <Input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={MAX_NAME_LENGTH}
        />
        <FieldError message={fieldErrors.displayName} />
      </Label>
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
      <Label>
        Confirm password
        <Input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
        <FieldError message={fieldErrors.confirmPassword} />
      </Label>
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={submitting}>
        {submitting && <Loader2 className="size-4 animate-spin" />}
        {submitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  )
}
