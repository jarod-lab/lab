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
 * better-auth endpoints the plugin guards: each adds or removes a credential, changes who may act, or
 * changes security config. Checked against better-auth 1.7.7 and the plugins' dists: the ones it guards
 * itself (passkey registration by default, unlink-account, delete-user, ...) are listed anyway, so the
 * window is one rule.
 */
export const FRESH_SESSION_PATHS = [
  // Passkeys: start a registration, finish one, delete one.
  "/passkey/generate-register-options",
  "/passkey/verify-registration",
  "/passkey/delete-passkey",
  // Two-factor enrolment and new backup codes (disable is guarded by better-auth itself).
  "/two-factor/enable",
  "/two-factor/generate-backup-codes",
  // Sign-in methods: link an external account to this user.
  "/link-social",
  // SCIM token mint (scim-token.ts wraps the plugin's connection; the token is returned once).
  "/scim/generate-token",
  // Organization API keys.
  "/api-key/create",
  "/api-key/update",
  "/api-key/delete",
  // Single sign-on: register, change, remove a provider, and prove its domain (routes sign-in).
  "/sso/register",
  "/sso/update-provider",
  "/sso/delete-provider",
  "/sso/verify-domain",
  // Organization members and roles.
  "/organization/invite-member",
  "/organization/update-member-role",
  "/organization/remove-member",
  "/organization/delete",
  "/organization/create-role",
  "/organization/update-role",
  "/organization/delete-role",
  // OAuth clients and the grants a person gives them (consent issues the tokens; device approve
  // issues them to a CLI). Client secrets are minted by create and rotate-secret.
  "/oauth2/create-client",
  "/oauth2/update-client",
  "/oauth2/client/rotate-secret",
  "/oauth2/delete-client",
  "/oauth2/consent",
  "/oauth2/update-consent",
  "/device/approve",
  // Platform admin: create or change users, their passwords and bans, remove them, change a role,
  // or act as someone.
  "/admin/create-user",
  "/admin/set-user-password",
  "/admin/ban-user",
  "/admin/unban-user",
  "/admin/remove-user",
  "/admin/update-user",
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
