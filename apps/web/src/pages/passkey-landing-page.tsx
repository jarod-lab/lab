import { Button } from "@starter/ui/components/ui/button"

import { AuthCard, ErrorAlert } from "../components/auth-card"

/** Where the emailed sign-up link has got to: checking, signed in and waiting, or done. */
export type PasskeyLandingState =
  | "checking"
  | "signed-out"
  | "ready"
  | "adding"
  | "failed"
  | "added"

export interface PasskeyLandingPageProps {
  state: PasskeyLandingState
  /** The failure from the last attempt, when there was one. */
  error: string | null
  /** Where the sign-up sends the person for a fresh start, when the link has gone stale. */
  signUpHref: string
  onAddPasskey: () => void
  onSkip: () => void
  onContinue: () => void
}

/**
 * The page the emailed sign-up link lands on. The link has signed the person in, so this page adds
 * their passkey. The button makes the browser's passkey prompt (it needs a click, so nothing starts on
 * load), and skipping leaves the account with no passkey or password until one is added.
 */
export function PasskeyLandingPage({
  state,
  error,
  signUpHref,
  onAddPasskey,
  onSkip,
  onContinue,
}: PasskeyLandingPageProps) {
  if (state === "checking") {
    return (
      <AuthCard title="Finishing your sign-up">
        <output className="block text-muted-foreground">Checking your link…</output>
      </AuthCard>
    )
  }

  if (state === "signed-out") {
    return (
      <AuthCard
        title="This link didn't sign you in"
        description="It may have been used already, or it may have expired. Start again to get a new link."
        footer={
          <p>
            <a
              href={signUpHref}
              className="font-semibold text-foreground underline underline-offset-4"
            >
              Start again
            </a>
          </p>
        }
      />
    )
  }

  if (state === "added") {
    return (
      <AuthCard title="Your passkey is ready" description="You can sign in with it from now on.">
        <Button type="button" onClick={onContinue}>
          Continue
        </Button>
      </AuthCard>
    )
  }

  const busy = state === "adding"
  return (
    <AuthCard
      title="Add a passkey"
      description="Your email is confirmed and you're signed in. A passkey lets you sign in with this device's screen lock, with no password to remember."
      footer={
        <p>
          Without a passkey or a password, this account has nothing to sign in with yet. You can add
          one later in Account security.
        </p>
      }
    >
      <ErrorAlert message={error} />
      <div className="flex flex-col gap-3">
        <Button type="button" disabled={busy} onClick={onAddPasskey}>
          {state === "failed" ? "Try again" : "Create passkey"}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    </AuthCard>
  )
}
