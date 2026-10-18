import { useId, useRef, useState } from "react"

import { Button } from "@starter/ui/components/ui/button"
import type { RenderLink } from "@starter/ui/dplus/shell/link"

import { accountErrorMessage } from "../../lib/account-api"
import { ConfirmDialog } from "../../components/confirm-dialog"

// The sections of the Security page (board Security). Each takes its data and callbacks as props.
// Errors a call throws are shown in the section; the container has already mapped their copy.

import { ROW, TEXT, META } from "./shared"
import { FormError } from "../../components/form"

// ---- Sessions -------------------------------------------------------------------------------------

export interface SessionRow {
  token: string
  device: string
  method: string | null
  when: string
  current: boolean
}

export interface SessionsSectionProps {
  sessions: SessionRow[]
  /** The list needs a recent sign-in before it can be read. */
  needsSignIn: boolean
  signInHref: string
  onRevoke: (token: string) => Promise<void>
  onRevokeOthers: () => Promise<void>
  renderLink: RenderLink
}

export function SessionsSection({
  sessions,
  needsSignIn,
  signInHref,
  onRevoke,
  onRevokeOthers,
  renderLink,
}: SessionsSectionProps) {
  const headingId = useId()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // The session being signed out: its button waits, so a second click doesn't send a second revoke.
  const [revoking, setRevoking] = useState<string | null>(null)
  const revokingRef = useRef<string | null>(null)
  const others = sessions.filter((session) => !session.current)
  const revoke = async (token: string) => {
    if (revokingRef.current !== null) return
    revokingRef.current = token
    setRevoking(token)
    setError(null)
    try {
      await onRevoke(token)
    } catch (caught) {
      setError(accountErrorMessage(caught))
    } finally {
      revokingRef.current = null
      setRevoking(null)
    }
  }

  const signOutOthers = async () => {
    setBusy(true)
    setError(null)
    try {
      await onRevokeOthers()
      setConfirming(false)
    } catch (caught) {
      setError(accountErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <div className="mb-1.5 flex flex-wrap items-center gap-3">
        <h2 id={headingId} className="flex-1 text-base font-bold">
          Where you're signed in
        </h2>
        {others.length > 0 ? (
          <Button variant="outline" onClick={() => setConfirming(true)}>
            Sign out everywhere else
          </Button>
        ) : null}
      </div>
      <FormError message={error} />
      {needsSignIn ? (
        <p className="border-t border-border py-2.5 text-sm">
          Sign in again to see your sessions. Listing them needs a recent sign-in.{" "}
          {renderLink({
            href: signInHref,
            className: "underline underline-offset-4",
            children: "Sign in again",
          })}
        </p>
      ) : null}
      {sessions.map((session) => (
        <div key={session.token} className={ROW}>
          <div className={TEXT}>
            <span className="font-semibold">
              {session.device}
              {session.current ? (
                <span className="ml-1.5 rounded bg-solar px-1.5 text-xs font-extrabold text-solar-foreground">
                  This device
                </span>
              ) : null}
            </span>
            <span className={META}>
              {session.method ? `Signed in with ${session.method}` : "Signed in"} · {session.when}
            </span>
          </div>
          {session.current ? null : (
            <Button
              variant="outline"
              aria-label={`Sign out ${session.device}`}
              disabled={revoking === session.token}
              onClick={() => void revoke(session.token)}
            >
              Sign out
            </Button>
          )}
        </div>
      ))}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Sign out everywhere else?"
        description={`This signs out ${others.length} other ${others.length === 1 ? "session" : "sessions"}, including any on other devices. This one stays signed in.`}
        confirmLabel="Sign out others"
        destructive
        pending={busy}
        error={error}
        onConfirm={() => void signOutOthers()}
      />
    </section>
  )
}
