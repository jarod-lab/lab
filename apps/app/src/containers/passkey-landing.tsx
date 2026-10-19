import { useEffect, useState } from "react"

import { navigateTo } from "../lib/navigation"
import { addSignUpPasskey } from "../lib/passkey-signup"
import { type AuthClient, makeAuthClient, type WebAuth, type WebSession } from "../lib/web-auth"
import { messageOf } from "../lib/messages"
import { type PasskeyLandingState, PasskeyLandingPage } from "../pages/passkey-landing-page"

/** The name the new passkey is listed under in Account security. */
export const SIGN_UP_PASSKEY_NAME = "Sign-up passkey"

/**
 * The landing page's data: the session the link made (checked on load), and adding the passkey on a
 * click. `client` is injected by tests; the browser builds its own (same origin, so cookies go with it).
 */
export function PasskeyLandingContainer({
  auth,
  next,
  signUpHref,
  signInHref,
  linkError = null,
  client,
  navigate = navigateTo,
}: {
  auth: WebAuth
  /** Where the person goes once the passkey step is over (a safe path, already checked). */
  next: string
  signUpHref: string
  signInHref?: string
  /**
   * The `error` the server put on the way here (passkey-signup.ts): the link was refused, so there is
   * nothing to check for a session.
   */
  linkError?: string | null
  client?: AuthClient
  /** Full-page navigation to `next`. Tests inject a spy. */
  navigate?: (url: string) => void
}) {
  const [authClient] = useState(() => client ?? makeAuthClient())
  const [state, setState] = useState<PasskeyLandingState>(linkError ? "refused" : "checking")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (linkError) return
    let live = true
    void (async () => {
      let session: WebSession | null = null
      try {
        session = await auth.getSession()
      } catch {
        session = null
      }
      if (live) setState(session ? "ready" : "signed-out")
    })()
    return () => {
      live = false
    }
  }, [auth, linkError])

  async function addPasskey() {
    setState("adding")
    setError(null)
    try {
      await addSignUpPasskey(authClient, SIGN_UP_PASSKEY_NAME)
      setState("added")
    } catch (caught) {
      setError(messageOf(caught))
      setState("failed")
    }
  }

  return (
    <PasskeyLandingPage
      state={state}
      error={error}
      signUpHref={signUpHref}
      signInHref={signInHref}
      onAddPasskey={() => void addPasskey()}
      onSkip={() => navigate(next)}
      onContinue={() => navigate(next)}
    />
  )
}
