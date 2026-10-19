import { useState } from "react"

import { sendPasskeySignUpLink } from "../lib/passkey-signup"
import { type AuthClient, makeAuthClient, type WebAuth } from "../lib/web-auth"
import { SignUpPage } from "../pages/auth-pages"

/**
 * The sign-up route's data: the passkey button sends the sign-up link through the auth client.
 * `client` is injected by tests; the browser builds its own (same origin, so cookies go with it).
 */
export function SignUpContainer({
  auth,
  next,
  signInHref,
  client,
}: {
  auth: WebAuth
  next: string
  signInHref: string
  client?: AuthClient
}) {
  const [authClient] = useState(() => client ?? makeAuthClient())
  return (
    <SignUpPage
      auth={auth}
      next={next}
      signInHref={signInHref}
      onPasskeySignUp={(values) => sendPasskeySignUpLink(authClient, values)}
    />
  )
}
