import { useId, useState } from "react"

import { Button } from "@starter/ui/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@starter/ui/components/ui/field"
import { Input } from "@starter/ui/components/ui/input"

import { AuthCard, ErrorAlert } from "../components/auth-card"
import { type AccountApi, accountErrorMessage } from "../lib/account-api"
import { navigateTo } from "../lib/navigation"

export interface TwoFactorPageProps {
  /** Where to go once the second step passes, when nothing else applies. */
  next: string
  /** A link's callbackURL (a magic link with two-factor): the authorization it was headed to, if any. */
  callbackURL?: string
  signIn: Pick<AccountApi, "completeSignInWithCode" | "completeSignInWithBackupCode">
  /** Resumes a pending OAuth authorization on this page's signed query (POST /oauth2/continue). */
  continueOAuth: () => Promise<string | undefined>
}

/**
 * The callbackURL when it is this site (a path, or an absolute URL on this origin). Anything else is
 * refused, so the page cannot be used to send someone to another site.
 */
export function sameSiteCallback(value: string | undefined, origin: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value, origin)
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : undefined
  } catch {
    return undefined
  }
}

/**
 * The second step of a password sign-in (the twoFactor plugin redirects here with the sign-in's
 * query kept). An app code, or a backup code when the app isn't to hand.
 */
export function TwoFactorPage({ next, callbackURL, signIn, continueOAuth }: TwoFactorPageProps) {
  const id = useId()
  const [useBackup, setUseBackup] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Where a passed code goes: the server's continuation, then a magic link's authorization, then an
  // OAuth authorization this page's signed query carries, then the page the sign-in was for.
  async function resumeTarget(): Promise<string> {
    const origin = window.location.origin
    const linked = sameSiteCallback(callbackURL, origin)
    if (linked) return linked
    if (new URLSearchParams(window.location.search).has("client_id")) {
      const resumed = await continueOAuth()
      if (resumed) return resumed
    }
    return next
  }

  async function submit(form: HTMLFormElement) {
    const value = String(new FormData(form).get("code") ?? "").trim()
    if (value === "") {
      setError(useBackup ? "Enter a backup code." : "Enter the six-digit code from your app.")
      return
    }
    setPending(true)
    setError(null)
    try {
      const url = useBackup
        ? await signIn.completeSignInWithBackupCode(value)
        : await signIn.completeSignInWithCode(value)
      navigateTo(url ?? (await resumeTarget()))
    } catch (caught) {
      setError(accountErrorMessage(caught))
      setPending(false)
    }
  }

  return (
    <AuthCard
      title="Two-factor authentication"
      description={
        useBackup
          ? "Enter one of the backup codes you saved. Each code works once."
          : "Enter the six-digit code from your authenticator app."
      }
      footer={
        <button
          type="button"
          className="underline underline-offset-4"
          onClick={() => {
            setError(null)
            setUseBackup((value) => !value)
          }}
        >
          {useBackup ? "Use an app code instead" : "Use a backup code instead"}
        </button>
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit(event.currentTarget)
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={id}>{useBackup ? "Backup code" : "Code"}</FieldLabel>
            <Input
              id={id}
              name="code"
              autoComplete="one-time-code"
              inputMode={useBackup ? "text" : "numeric"}
              disabled={pending}
              required
            />
            <FieldDescription>
              {useBackup ? "Codes look like xxxxx-xxxxx." : "The code changes every 30 seconds."}
            </FieldDescription>
          </Field>
          <ErrorAlert message={error} />
          <Button type="submit" disabled={pending}>
            {pending ? "Checking…" : "Continue"}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  )
}
