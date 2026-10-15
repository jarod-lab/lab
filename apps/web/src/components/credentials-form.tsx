import { useId } from "react"

import { Button } from "@starter/ui/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@starter/ui/components/ui/field"
import { Input } from "@starter/ui/components/ui/input"

import { ErrorAlert } from "./auth-card"

export interface CredentialValues {
  name: string
  email: string
  password: string
}

/**
 * Email and password, with a name for sign-up. Stateless: the page owns pending and error state and
 * decides what happens after a successful submit.
 */
export function CredentialsForm({
  mode,
  pending,
  error,
  defaultEmail = "",
  submitLabel,
  onSubmit,
}: {
  mode: "sign-in" | "sign-up"
  pending: boolean
  error: string | null
  defaultEmail?: string
  submitLabel: string
  onSubmit: (values: CredentialValues) => void
}) {
  const id = useId()
  const signUp = mode === "sign-up"

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        onSubmit({
          name: String(data.get("name") ?? ""),
          email: String(data.get("email") ?? ""),
          password: String(data.get("password") ?? ""),
        })
      }}
    >
      <FieldGroup>
        {signUp ? (
          <Field>
            <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
            <Input id={`${id}-name`} name="name" autoComplete="name" required disabled={pending} />
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor={`${id}-email`}>Email</FieldLabel>
          <Input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={defaultEmail}
            required
            disabled={pending}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-password`}>Password</FieldLabel>
          <Input
            id={`${id}-password`}
            name="password"
            type="password"
            autoComplete={signUp ? "new-password" : "current-password"}
            minLength={signUp ? 8 : undefined}
            required
            disabled={pending}
            aria-describedby={signUp ? `${id}-password-hint` : undefined}
          />
          {signUp ? (
            <FieldDescription id={`${id}-password-hint`}>
              Use at least 8 characters.
            </FieldDescription>
          ) : null}
        </Field>
        <ErrorAlert message={error} />
        <Button type="submit" disabled={pending}>
          {pending ? "Please wait" : submitLabel}
        </Button>
      </FieldGroup>
    </form>
  )
}
