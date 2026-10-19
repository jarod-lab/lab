// Audit events for auth activity: sign-ins (and failed ones), sign-outs, credential and factor
// changes, sessions, linked accounts, API keys, SSO providers, member changes, impersonation and
// account deletion. One after hook maps better-auth's endpoints to event names. better-auth runs
// after hooks for failed calls too, with the APIError in `ctx.context.returned`, so a failure is an
// event with its error code as the outcome.
//
// The writer is injected (`onAuthEvent`), so this package never imports the API's data layer.
import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { reportError } from "@starter/errors"

export const AUTH_EVENT_NAMES = [
  "auth.sign_in",
  "auth.sign_in_failed",
  "auth.sign_up_started",
  "auth.sign_out",
  "auth.password_changed",
  "auth.password_reset",
  "auth.email_change_requested",
  "auth.two_factor_enabled",
  "auth.two_factor_disabled",
  "auth.passkey_added",
  "auth.passkey_removed",
  "auth.session_revoked",
  "auth.account_linked",
  "auth.account_unlinked",
  "auth.api_key_created",
  "auth.api_key_deleted",
  "auth.sso_provider_registered",
  "auth.member_role_changed",
  "auth.member_removed",
  "auth.impersonation_started",
  "auth.impersonation_stopped",
  "auth.user_deleted",
] as const

export type AuthEventName = (typeof AUTH_EVENT_NAMES)[number]

export interface AuthEvent {
  name: AuthEventName
  /** The person the event is about or who did it. Null when no account is known (unknown email). */
  userId: string | null
  /** The organization the event belongs to, or null for account-level events. */
  organizationId: string | null
  /** The other person an admin action touches (impersonation target). */
  subjectUserId?: string
  /** "ok", or the error code of a refused call. */
  outcome: string
  /** The client IP from the rate-limit header (see rate-limit.ts), when the request had one. */
  ip?: string
  /** The better-auth endpoint path, e.g. "/sign-in/email". */
  path: string
}

/** What the mapper sees of one after-hook call. Tests build these by hand. */
export interface AuthCallContext {
  path: string
  body?: Record<string, unknown>
  /** `ctx.context.session`: the session the request came in with. */
  session?: AuthSession | null
  /** `ctx.context.newSession`: the session a sign-in created. */
  newSession?: AuthSession | null
  /** `ctx.context.returned`: the endpoint's result, or the APIError it threw. */
  returned?: unknown
  ip?: string
  findUserIdByEmail: (email: string) => Promise<string | null>
}

export interface AuthSession {
  user: { id: string }
  session: { activeOrganizationId?: string | null }
}

export interface AuthEventsOptions {
  /** Awaited after each event. Its errors are reported and never reach the auth response. */
  onAuthEvent: (event: AuthEvent) => void | Promise<void>
  /** Header holding the trusted client IP. Defaults to `x-starter-client-ip`. */
  ipHeader?: string
}

export const AUTH_EVENT_IP_HEADER = "x-starter-client-ip"

/** A rule's event. `outcome` is set only where the call's result isn't the outcome (see the verify rule). */
type Draft = Pick<AuthEvent, "name" | "userId" | "organizationId" | "subjectUserId"> & {
  outcome?: string
}
type Rule = (call: AuthCallContext, failed: boolean) => Promise<Draft | null>

const returnedRecord = (call: AuthCallContext): Record<string, unknown> | null =>
  call.returned && typeof call.returned === "object"
    ? (call.returned as Record<string, unknown>)
    : null

/**
 * The acting person: the sign-in that just happened, else the request's session. The result's user
 * is the last resort (a passkey registered without a session); it is not used first, since an
 * impersonation returns the target's session.
 */
function actingUser(call: AuthCallContext): string | null {
  const returnedUser = returnedRecord(call)?.user as { id?: unknown } | undefined
  return (
    call.newSession?.user.id ??
    call.session?.user.id ??
    (typeof returnedUser?.id === "string" ? returnedUser.id : null)
  )
}

const returnedString = (call: AuthCallContext, key: string): string | null => {
  const value = returnedRecord(call)?.[key]
  return typeof value === "string" ? value : null
}

const activeOrganization = (call: AuthCallContext): string | null =>
  call.session?.session.activeOrganizationId ?? null

const bodyString = (call: AuthCallContext, key: string): string | null => {
  const value = call.body?.[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

/** The organization a request names in its body, else the one its session has active. */
const requestedOrganization = (call: AuthCallContext) =>
  bodyString(call, "organizationId") ?? activeOrganization(call)

/** An account-level event: no organization. */
const account =
  (name: AuthEventName): Rule =>
  async (call) => ({ name, userId: actingUser(call), organizationId: null })

/** An organization-scoped event. */
const inOrganization =
  (
    name: AuthEventName,
    organizationOf: (call: AuthCallContext) => string | null = requestedOrganization,
  ): Rule =>
  async (call) => ({ name, userId: actingUser(call), organizationId: organizationOf(call) })

/**
 * A sign-in completing. Only a call that created a session counts: a password sign-in that still
 * needs a second factor creates none yet, and the completing step is the event.
 */
const signIn =
  (failedUser: (call: AuthCallContext) => Promise<string | null>): Rule =>
  async (call, failed) => {
    if (failed)
      return { name: "auth.sign_in_failed", userId: await failedUser(call), organizationId: null }
    const userId = call.newSession?.user.id
    return userId ? { name: "auth.sign_in", userId, organizationId: null } : null
  }

const emailUserId = async (call: AuthCallContext) => {
  const email = bodyString(call, "email")
  return email ? call.findUserIdByEmail(email.toLowerCase()) : null
}

/**
 * better-auth's endpoint path to its event. Paths are the endpoint patterns better-auth matches
 * (`ctx.path`), so `/callback/:id` is the social callback for every provider.
 */
const RULES: Record<string, Rule> = {
  "/sign-in/email": signIn(emailUserId),
  "/magic-link/verify": signIn(async () => null),
  // The second factor completes a password sign-in that asked for one (it creates the session).
  "/two-factor/verify-totp": signIn(async () => null),
  "/two-factor/verify-otp": signIn(async () => null),
  "/two-factor/verify-backup-code": signIn(async () => null),
  "/passkey/verify-authentication": signIn(async () => null),
  // Social and SSO callbacks: a new session is a sign-in; an existing session with no new one is an
  // account being linked. A failed callback is not recorded (the provider's error is shown instead).
  "/callback/:id": async (call, failed) => {
    if (failed) return null
    if (call.newSession)
      return { name: "auth.sign_in", userId: call.newSession.user.id, organizationId: null }
    if (call.session)
      return { name: "auth.account_linked", userId: call.session.user.id, organizationId: null }
    return null
  },
  "/sso/callback/:providerId": async (call, failed) => {
    if (failed || !call.newSession) return null
    return { name: "auth.sign_in", userId: call.newSession.user.id, organizationId: null }
  },
  "/sign-out": account("auth.sign_out"),
  "/change-password": account("auth.password_changed"),
  "/reset-password": account("auth.password_reset"),
  "/change-email": account("auth.email_change_requested"),
  // Enabling is recorded when the factor is set up; the authenticator is confirmed by verify-totp.
  "/two-factor/enable": account("auth.two_factor_enabled"),
  "/two-factor/disable": account("auth.two_factor_disabled"),
  "/passkey/verify-registration": account("auth.passkey_added"),
  "/passkey/delete-passkey": account("auth.passkey_removed"),
  "/revoke-session": account("auth.session_revoked"),
  "/revoke-sessions": account("auth.session_revoked"),
  "/revoke-other-sessions": account("auth.session_revoked"),
  "/unlink-account": account("auth.account_unlinked"),
  // The key belongs to the organization it was created for (its reference); the active one otherwise.
  "/api-key/create": async (call) => ({
    name: "auth.api_key_created",
    userId: actingUser(call),
    organizationId: returnedString(call, "referenceId") ?? activeOrganization(call),
  }),
  "/api-key/delete": inOrganization("auth.api_key_deleted", activeOrganization),
  "/sso/register": inOrganization("auth.sso_provider_registered"),
  "/organization/update-member-role": inOrganization("auth.member_role_changed"),
  "/organization/remove-member": inOrganization("auth.member_removed"),
  "/admin/impersonate-user": async (call) => ({
    name: "auth.impersonation_started",
    userId: actingUser(call),
    organizationId: null,
    subjectUserId: bodyString(call, "userId") ?? undefined,
  }),
  "/admin/stop-impersonating": account("auth.impersonation_stopped"),
  // Deletion is confirmed by an emailed link. Requesting it (no token) is not the deletion.
  "/delete-user": async (call) =>
    bodyString(call, "token")
      ? { name: "auth.user_deleted", userId: actingUser(call), organizationId: null }
      : null,
  "/delete-user/callback": account("auth.user_deleted"),
  // Passkey sign-up (passkey-signup.ts). Starting it names the address's account (just created, or the
  // one a refused start found); a refused start keeps its code as the outcome.
  "/passkey-signup/start": async (call) => ({
    name: "auth.sign_up_started",
    userId: await emailUserId(call),
    organizationId: null,
  }),
  // Opening the link signs the person in. Its success is a redirect (better-auth's redirects are
  // thrown errors), so the rule reads the new session, not the result; a refused link has none.
  "/passkey-signup/verify": async (call) => {
    const userId = call.newSession?.user.id
    return userId ? { name: "auth.sign_in", userId, organizationId: null, outcome: "ok" } : null
  },
}

export const AUTH_EVENT_PATHS = Object.keys(RULES)

/** The error code of a refused call: better-auth's code, else its status name. */
export function errorCodeOf(error: unknown): string {
  if (!(error instanceof APIError)) return "INTERNAL"
  const code = (error.body as { code?: unknown } | undefined)?.code
  return typeof code === "string" ? code : String(error.status)
}

/**
 * The event for one after-hook call, or null when the call isn't an event (an unmapped path, or a
 * step that doesn't end the flow yet).
 */
export async function mapAuthEvent(call: AuthCallContext): Promise<AuthEvent | null> {
  const rule = RULES[call.path]
  if (!rule) return null
  const failed = call.returned instanceof APIError
  const draft = await rule(call, failed)
  if (!draft) return null
  const { outcome, ...fields } = draft
  return {
    ...fields,
    outcome: outcome ?? (failed ? errorCodeOf(call.returned) : "ok"),
    ...(call.ip ? { ip: call.ip } : {}),
    path: call.path,
  }
}

/** The better-auth plugin: one after hook, matched on the mapped paths. */
export function authEvents(opts: AuthEventsOptions): BetterAuthPlugin {
  const ipHeader = opts.ipHeader ?? AUTH_EVENT_IP_HEADER
  return {
    id: "starter-auth-events",
    hooks: {
      after: [
        {
          matcher: (ctx: { path?: string }) => ctx.path !== undefined && ctx.path in RULES,
          handler: createAuthMiddleware(async (ctx) => {
            try {
              const event = await mapAuthEvent({
                path: ctx.path,
                body: ctx.body as Record<string, unknown> | undefined,
                session: ctx.context.session as AuthSession | null | undefined,
                newSession: ctx.context.newSession as AuthSession | null | undefined,
                returned: ctx.context.returned,
                ip: ctx.headers?.get(ipHeader) ?? undefined,
                findUserIdByEmail: async (email) => {
                  const user = await ctx.context.adapter.findOne<{ id: string }>({
                    model: "user",
                    where: [{ field: "email", value: email }],
                  })
                  return user?.id ?? null
                },
              })
              if (event) await opts.onAuthEvent(event)
            } catch (error) {
              // An audit write must never change the auth response the person gets.
              reportError(error, { phase: "auth-event", path: ctx.path })
            }
          }),
        },
      ],
    },
  }
}
