import { useId, useState } from "react"

import { Button } from "@starter/ui/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@starter/ui/components/ui/field"
import { Input } from "@starter/ui/components/ui/input"

import { AuthCard, ErrorAlert } from "../components/auth-card"
import { messageOf } from "../lib/messages"
import type { WebAuth } from "../lib/web-auth"

/**
 * Sets a password from an emailed link. `reset` is a forgotten password; `claim` is the account an
 * agent created for the person (its claim email links here too, carrying a reset token).
 */
export function PasswordPage({
  auth,
  mode,
  token,
  linkError,
}: {
  auth: WebAuth
  mode: "reset" | "claim"
  token: string | undefined
  linkError?: string
}) {
  const id = useId()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const copy =
    mode === "claim"
      ? {
          title: "Claim your account",
          description: "An agent created this account for you. Set a password to claim it.",
          submit: "Claim account",
          success: "Your account is claimed. Sign in with the password you just set.",
        }
      : {
          title: "Choose a new password",
          description: "Enter a new password for your account.",
          submit: "Set password",
          success: "Your password is set. Sign in with it.",
        }

  if (!token || linkError) {
    return (
      <AuthCard
        title={copy.title}
        footer={
          <a href="/sign-in" className="underline underline-offset-4">
            Back to sign in
          </a>
        }
      >
        <ErrorAlert
          message={
            token
              ? "This link is invalid or has expired. Ask for a new one."
              : "This link is missing its token. Open the link from the email again."
          }
        />
      </AuthCard>
    )
  }

  if (done) {
    return (
      <AuthCard
        title={copy.title}
        description={copy.success}
        footer={
          <a href="/sign-in" className="underline underline-offset-4">
            Go to sign in
          </a>
        }
      />
    )
  }

  async function submit(form: HTMLFormElement) {
    const data = new FormData(form)
    const password = String(data.get("password") ?? "")
    const confirm = String(data.get("confirm") ?? "")
    if (password.length < 8) {
      setError("The new password must be at least 8 characters long.")
      return
    }
    if (password !== confirm) {
      setError("The two passwords do not match.")
      return
    }
    setPending(true)
    setError(null)
    try {
      await auth.resetPassword({ token: token ?? "", newPassword: password })
      setDone(true)
    } catch (caught) {
      setError(messageOf(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthCard title={copy.title} description={copy.description}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit(event.currentTarget)
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${id}-password`}>New password</FieldLabel>
            <Input
              id={`${id}-password`}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              disabled={pending}
              aria-describedby={`${id}-hint`}
            />
            <FieldDescription id={`${id}-hint`}>Use at least 8 characters.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-confirm`}>Confirm password</FieldLabel>
            <Input
              id={`${id}-confirm`}
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              disabled={pending}
            />
          </Field>
          <ErrorAlert message={error} />
          <Button type="submit" disabled={pending}>
            {pending ? "Please wait" : copy.submit}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  )
}
