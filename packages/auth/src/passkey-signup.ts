// Passkey sign-up, email first. Nothing here issues a credential or a session for an address until
// the mailbox is proven:
//   1. POST /passkey-signup/start creates the unverified user (its personal organization comes from
//      the user create hook) and emails a single-use link. It returns no token and sets no cookie.
//   2. GET /passkey-signup/verify?token=… (the link) marks the address verified, consumes the token,
//      and signs the person in. The session is then fresh.
//   3. The page then calls passkey.addPasskey(), a normal session-bound registration: passkey's own
//      defaults apply (fresh session required), so passkey() needs no registration option.
// Someone who never opens the mail holds no credential and no session for that address.
import { randomBytes } from "node:crypto"

import type { Database } from "@starter/db"
import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthEndpoint, getIP } from "better-auth/api"
import { setSessionCookie } from "better-auth/cookies"

import { signupLimitBreach } from "./signup"

export const PASSKEY_SIGNUP_START_PATH = "/passkey-signup/start"
export const PASSKEY_SIGNUP_VERIFY_PATH = "/passkey-signup/verify"

/** How long the emailed link works. */
export const PASSKEY_SIGNUP_TTL_MS = 30 * 60_000

const TOKEN_PREFIX = "passkey-signup:"

export interface PasskeySignupDeps {
  db: Database
  /**
   * Sends the link. `url` is the absolute verify URL. index.ts picks the sender (the same SES path as
   * the other auth emails).
   */
  sendLink: (input: { email: string; name: string; url: string }) => Promise<void>
}

/** The internal adapter methods this file calls (better-auth types them loosely). */
interface Internal {
  findUserByEmail(email: string): Promise<{ user: { id: string } } | null>
  createUser(
    data: { email: string; name: string; emailVerified: boolean },
    source: { method: string },
  ): Promise<{ id: string }>
  createVerificationValue(data: {
    identifier: string
    value: string
    expiresAt: Date
  }): Promise<unknown>
  findVerificationValue(identifier: string): Promise<{ value: string; expiresAt: Date } | null>
  consumeVerificationValue(identifier: string): Promise<{ value: string; expiresAt: Date } | null>
  findUserById(id: string): Promise<{ id: string; email: string; emailVerified: boolean } | null>
  updateUser(id: string, data: Record<string, unknown>): Promise<unknown>
  createSession(
    userId: string,
    context?: unknown,
  ): Promise<{ token: string; userId: string } | null>
}

const invalidLink = () =>
  APIError.from("BAD_REQUEST", {
    message: "This sign-up link is invalid or has expired. Start again.",
    code: "PASSKEY_SIGNUP_EXPIRED",
  })

/** The return path after the link: a path on this site only (no scheme, no `//`), else the home page. */
export function safePath(value: unknown): string {
  if (typeof value !== "string") return "/"
  return /^\/(?!\/)[^\s\\]*$/.test(value) ? value : "/"
}

/** Email and name from the body, checked by hand (this package has no schema library). */
function parseStart(body: unknown): { email: string; name: string } {
  const value = (body ?? {}) as { email?: unknown; name?: unknown }
  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : ""
  const at = email.lastIndexOf("@")
  if (at <= 0 || at === email.length - 1) {
    throw APIError.from("BAD_REQUEST", {
      message: "Enter a valid email address",
      code: "BAD_REQUEST",
    })
  }
  const name = typeof value.name === "string" ? value.name.trim() : ""
  return { email, name: name || email.slice(0, at) }
}

/**
 * The passkey sign-up plugin: the start endpoint (sends the link) and the verify endpoint (the link's
 * target: proves the mailbox and signs in). Mount it next to passkey(), which keeps its defaults.
 */
export function passkeySignupPlugin(deps: PasskeySignupDeps) {
  return {
    id: "starter-passkey-signup",
    endpoints: {
      passkeySignupStart: createAuthEndpoint(
        PASSKEY_SIGNUP_START_PATH,
        { method: "POST" },
        async (ctx) => {
          const { email, name } = parseStart(ctx.body)
          const body = (ctx.body ?? {}) as { callbackURL?: unknown }
          const internal = ctx.context.internalAdapter as unknown as Internal
          const source = ctx.request ?? ctx.headers
          const ip = (source && getIP(source, ctx.context.options)) || "unknown"
          const domain = email.slice(email.lastIndexOf("@") + 1)
          const breach = await signupLimitBreach(deps.db, { ip, domain })
          if (breach) {
            throw new APIError(
              "TOO_MANY_REQUESTS",
              { message: breach.message, code: "RATE_LIMITED" },
              { "retry-after": String(breach.retryAfter) },
            )
          }
          if (await internal.findUserByEmail(email)) {
            throw APIError.from("CONFLICT", {
              message: "An account already exists for this email. Use sign-in.",
              code: "ACCOUNT_EXISTS",
            })
          }
          // No password and no passkey yet: the only way forward is the link.
          const user = await internal.createUser(
            { email, name, emailVerified: false },
            { method: "passkey" },
          )
          const token = randomBytes(32).toString("base64url")
          await internal.createVerificationValue({
            identifier: `${TOKEN_PREFIX}${token}`,
            value: user.id,
            expiresAt: new Date(Date.now() + PASSKEY_SIGNUP_TTL_MS),
          })
          const callbackURL = encodeURIComponent(safePath(body.callbackURL))
          const url = `${ctx.context.baseURL}${PASSKEY_SIGNUP_VERIFY_PATH}?token=${token}&callbackURL=${callbackURL}`
          await deps.sendLink({ email, name, url })
          return ctx.json({ sent: true })
        },
      ),

      passkeySignupVerify: createAuthEndpoint(
        PASSKEY_SIGNUP_VERIFY_PATH,
        { method: "GET" },
        async (ctx) => {
          const query = (ctx.query ?? {}) as { token?: unknown; callbackURL?: unknown }
          const token = typeof query.token === "string" ? query.token : ""
          if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalidLink()
          const internal = ctx.context.internalAdapter as unknown as Internal
          const identifier = `${TOKEN_PREFIX}${token}`
          const row = await internal.findVerificationValue(identifier)
          if (!row || row.expiresAt.getTime() <= Date.now()) throw invalidLink()
          const user = await internal.findUserById(row.value)
          // A verified account is claimed: the link can't sign anyone in again.
          if (!user || user.emailVerified) throw invalidLink()
          // Single use: consumed before the session is made, so a replay finds nothing.
          if (!(await internal.consumeVerificationValue(identifier))) throw invalidLink()

          await internal.updateUser(user.id, { emailVerified: true })
          const session = await internal.createSession(user.id, ctx)
          if (!session) {
            throw APIError.from("INTERNAL_SERVER_ERROR", {
              message: "Could not sign in",
              code: "SESSION_NOT_CREATED",
            })
          }
          const verified = await internal.findUserById(user.id)
          await setSessionCookie(ctx, {
            session: session as never,
            user: (verified ?? user) as never,
          })
          throw ctx.redirect(safePath(query.callbackURL))
        },
      ),
    },
  } satisfies BetterAuthPlugin
}
