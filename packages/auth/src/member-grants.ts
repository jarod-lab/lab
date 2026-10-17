// A member who leaves or is removed takes their agents' access to that organization with them. The
// grant check (`grantStands` in principal.ts) only asks whether a consent or live refresh token
// stands, so without this a person removed and later re-added would find their old agent working
// again. Revoking stamps `revoked`, which also refuses access tokens issued before it.
import type { DBAdapter } from "better-auth"
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api"

type GrantAdapter = Pick<DBAdapter, "updateMany" | "deleteMany">

/** End every OAuth grant the user made in the organization: consents and refresh/access tokens. */
export async function revokeMemberGrants(
  db: GrantAdapter,
  userId: string,
  organizationId: string,
  now = new Date(),
): Promise<void> {
  const who = [
    { field: "userId", value: userId },
    { field: "referenceId", value: organizationId },
  ]
  for (const model of ["oauthRefreshToken", "oauthAccessToken"]) {
    await db.updateMany({
      model,
      where: [...who, { field: "revoked", value: null }],
      update: { revoked: now },
    })
  }
  await db.deleteMany({ model: "oauthConsent", where: who })
}

/**
 * `/organization/leave` doesn't run the organization plugin's remove-member hooks, so leaving is
 * caught here, once the leave has succeeded. `endScim` ends the person's SCIM tokens for the org
 * (see scim-token.ts), as a removal does.
 */
export const endGrantsOnLeave = (
  endScim: (userId: string, organizationId: string) => Promise<void>,
) =>
  createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/organization/leave" || ctx.context.returned instanceof APIError) return
    const organizationId = (ctx.body as { organizationId?: unknown } | undefined)?.organizationId
    const session = await getSessionFromCtx(ctx)
    if (typeof organizationId !== "string" || !session) return
    await revokeMemberGrants(ctx.context.adapter, session.user.id, organizationId)
    await endScim(session.user.id, organizationId)
  })
