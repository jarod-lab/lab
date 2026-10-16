// Impersonation (better-auth's admin plugin) lets a platform admin act as another user. Such a
// session is someone else's session on the admin's machine, so it must not grant anything that
// outlives the impersonation: no OAuth consent, no device approval, no API keys. It is also read-only
// through the product API (see principal.ts). Refused here, server-side, whatever the client sends.
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api"
import type { BetterAuthPlugin } from "better-auth"

/** better-auth endpoints an impersonated session may not call. */
export const IMPERSONATION_REFUSED_PATHS = [
  // Authorize and continue issue a code straight away when the user already consented: refused too.
  "/oauth2/authorize",
  "/oauth2/continue",
  "/oauth2/consent",
  "/device/approve",
  "/api-key/create",
  "/api-key/update",
] as const

export const impersonationGuard = {
  id: "starter-impersonation-guard",
  hooks: {
    before: [
      {
        matcher: (ctx: { path?: string }) =>
          IMPERSONATION_REFUSED_PATHS.includes(
            ctx.path as (typeof IMPERSONATION_REFUSED_PATHS)[number],
          ),
        handler: createAuthMiddleware(async (ctx) => {
          const session = await getSessionFromCtx(ctx)
          const impersonatedBy = (
            session?.session as { impersonatedBy?: string | null } | undefined
          )?.impersonatedBy
          if (impersonatedBy) {
            throw APIError.from("FORBIDDEN", {
              message: "An impersonated session cannot do this. Ask the user to do it themselves.",
              code: "IMPERSONATED_SESSION_NOT_ALLOWED",
            })
          }
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin

/** Whether a session is an impersonation (an admin acting as the user). */
export const isImpersonated = (session: unknown): boolean =>
  Boolean(
    (session as { session?: { impersonatedBy?: string | null } } | null)?.session?.impersonatedBy,
  )
