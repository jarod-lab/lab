import { type AuthClient, WebError } from "./web-auth"

/** The page the emailed link lands on: it adds the passkey (routes/sign-up_.passkey.tsx). */
export const PASSKEY_LANDING_PATH = "/sign-up/passkey"

/** The landing page's address for a sign-up that goes on to `next` once the passkey step is over. */
export function passkeyLandingPath(next: string): string {
  return `${PASSKEY_LANDING_PATH}?next=${encodeURIComponent(next)}`
}

export interface PasskeySignUpInput {
  name: string
  email: string
  /** Where the link goes after it signs the person in (a path on this site). */
  callbackURL?: string
}

/**
 * Step one of a passkey sign-up: the server makes the unverified account and emails a link
 * (POST /passkey-signup/start). Nothing is signed in yet, and the server issues no credential for
 * the address until the link is opened.
 */
export async function sendPasskeySignUpLink(
  client: AuthClient,
  input: PasskeySignUpInput,
): Promise<void> {
  const started = await client.$fetch("/passkey-signup/start", {
    method: "POST",
    body: {
      name: input.name,
      email: input.email,
      ...(input.callbackURL ? { callbackURL: input.callbackURL } : {}),
    },
  })
  if (started.error) throw failure(started.error, "Could not send the sign-up link")
}

/**
 * Step two, on the page the link lands on, where the person is now signed in: adds the passkey as a
 * normal session-bound registration (passkey's default checks apply).
 */
export async function addSignUpPasskey(client: AuthClient, name: string): Promise<void> {
  const added = await client.passkey.addPasskey({ name })
  if (added.error) throw failure(added.error, "Could not create the passkey")
}

type Failure = { message?: string; status?: number; code?: string } | null | undefined

function failure(error: Failure, fallback: string): WebError {
  return new WebError(error?.message || fallback, error?.status ?? 0, error?.code)
}
