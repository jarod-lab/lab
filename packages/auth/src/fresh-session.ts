// Sensitive actions need a recent sign-in, not just a session. better-auth guards a handful of its
// own endpoints with its freshness check (delete-user, change-password, two-factor/disable, ...), but
// not the ones that add a credential or change an organization's people. This plugin refuses those
// when the session is older than FRESH_AGE_SECONDS, with better-auth's own code SESSION_NOT_FRESH.
// The same window is set as `session.freshAge`, so better-auth's guarded endpoints agree with it.
// A request with no session passes through: the endpoint itself answers UNAUTHORIZED.
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api"
import type { BetterAuthPlugin } from "better-auth"

/** How long after sign-in a session may do the sensitive actions below: one hour. */
export const FRESH_AGE_SECONDS = 60 * 60

/**
 * better-auth endpoints the plugin guards: each adds or removes a credential, or changes who is in an
 * organization or what they may do. Verified against better-auth 1.7.7 (none is guarded upstream).
 */
export const FRESH_SESSION_PATHS = [
  // Passkeys: start a registration, finish one, delete one.
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
  "/passkey/delete-passkey",
  // Two-factor enrolment (disable is guarded by better-auth itself).
  "/two-factor/enable",
  // Organization API keys.
  "/api-key/create",
  "/api-key/update",
  // Single sign-on provider registration.
  "/sso/register",
  // Organization members and roles.
  "/organization/update-member-role",
  "/organization/remove-member",
  "/organization/delete",
  "/organization/create-role",
  "/organization/update-role",
  "/organization/delete-role",
  // Platform admin: change someone's role, or act as them.
  "/admin/set-role",
  "/admin/impersonate-user",
] as const

/** Whether a session created at `createdAt` is still fresh at `now`. */
export function isFresh(
  createdAt: Date | string | number,
  now: number = Date.now(),
  freshAgeSeconds: number = FRESH_AGE_SECONDS,
): boolean {
  return now - new Date(createdAt).getTime() < freshAgeSeconds * 1000
}

export const freshSessionGuard = {
  id: "starter-fresh-session",
  hooks: {
    before: [
      {
        matcher: (ctx: { path?: string }) =>
          FRESH_SESSION_PATHS.includes(ctx.path as (typeof FRESH_SESSION_PATHS)[number]),
        handler: createAuthMiddleware(async (ctx) => {
          const session = await getSessionFromCtx(ctx)
          if (!session) return
          if (!isFresh(session.session.createdAt)) {
            throw APIError.from("FORBIDDEN", {
              message: "Session is not fresh",
              code: "SESSION_NOT_FRESH",
            })
          }
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin
