// How a session was signed in, recorded on the session row (`loginMethod`, `loginTwoFactor`) so the
// security page can say "Signed in with passkey" or "email, password and two-factor". Resolved from the
// request that created the session: the same paths better-auth's lastLoginMethod plugin reads, plus the
// two-factor step. A two-factor code is entered after the password or the emailed link, so the method
// of that first step is recorded on the challenge (see magic-link-two-factor.ts); a password challenge
// records nothing and is "email".

/** The values `loginMethod` takes. Social providers are their provider id. */
export type LoginMethod = "email" | "magic-link" | "passkey" | "github" | "google" | (string & {})

/** The two-factor steps that complete a sign-in (a session is created only when one succeeds). */
const TWO_FACTOR_PATHS = new Set([
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/two-factor/verify-otp",
])

/** The verification-row prefix a link-started two-factor challenge stores its first-step method under. */
export const CHALLENGE_METHOD_PREFIX = "login-method-"

/** The subset of better-auth's endpoint context this reads. */
export interface LoginContext {
  path?: string
  params?: Record<string, unknown>
  getSignedCookie?: (name: string, secret: string) => Promise<string | null>
  context?: {
    secret: string
    createAuthCookie: (name: string) => { name: string }
    internalAdapter: {
      findVerificationValue: (identifier: string) => Promise<{ value: string } | null>
    }
  }
}

/** The method a request signs in with, from its path; null when it isn't a sign-in step. */
export function methodOfPath(context: LoginContext): LoginMethod | null {
  const path = context.path ?? ""
  if (path.startsWith("/callback/")) {
    const id = context.params?.id
    return typeof id === "string" ? id : (path.split("/").pop() ?? null)
  }
  if (path === "/sign-in/email" || path === "/sign-up/email") return "email"
  if (path === "/passkey/verify-authentication") return "passkey"
  if (path.startsWith("/sso/callback/")) return "sso"
  if (path.startsWith("/magic-link/verify")) return "magic-link"
  return null
}

/** The first-step method recorded for a two-factor challenge, or "email" (the password step). */
async function challengeMethod(context: LoginContext): Promise<LoginMethod> {
  const auth = context.context
  if (!auth || !context.getSignedCookie) return "email"
  const cookie = auth.createAuthCookie("two_factor")
  const identifier = await context.getSignedCookie(cookie.name, auth.secret)
  if (!identifier) return "email"
  const row = await auth.internalAdapter.findVerificationValue(
    `${CHALLENGE_METHOD_PREFIX}${identifier}`,
  )
  return row?.value ?? "email"
}

/** The loginMethod / loginTwoFactor values for the session a request creates. */
export async function signInOf(
  context: LoginContext | null,
): Promise<{ loginMethod: LoginMethod | null; loginTwoFactor: boolean }> {
  if (!context) return { loginMethod: null, loginTwoFactor: false }
  if (TWO_FACTOR_PATHS.has(context.path ?? "")) {
    return { loginMethod: await challengeMethod(context), loginTwoFactor: true }
  }
  return { loginMethod: methodOfPath(context), loginTwoFactor: false }
}
