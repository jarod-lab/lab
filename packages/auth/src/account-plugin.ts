// Account lifecycle rules that better-auth doesn't know about, as one plugin:
//  - deletion: refused while the user owns an organization they can't take with them (any org other
//    than their personal one, or one with other members), or the personal one has a live subscription.
//    Checked when the confirmation is requested and again when the link is opened (beforeDelete).
//  - unlinking: the last way in is kept. A way in is a password, another linked account, or a passkey
//    (better-auth only counts accounts). `allowUnlinkingAll` is on so the check here is the only one.
//  - email change: the address being replaced is told a change was requested (the new address gets
//    the confirmation link from index.ts).
import type { BetterAuthPlugin } from "better-auth"
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api"
import { decodeJwt } from "jose"
import {
  ACTIVE_SUBSCRIPTION_CODE,
  LAST_SIGN_IN_METHOD_CODE,
  OWNS_ORGANIZATION_CODE,
} from "./constants"
import { type Adapter, type Member, personalSlug } from "./membership"
import type { Notices } from "./notices"

/** Subscription states that still bill. */
const BILLING_STATUSES = ["active", "trialing", "past_due"]

interface Org {
  id: string
  name: string
  slug: string | null
}

/**
 * The organizations a user can't leave behind by deleting their account: owned by them, and either
 * not their personal one or shared with other members.
 */
export async function blockingOrganizations(db: Adapter, userId: string): Promise<Org[]> {
  const memberships = await db.findMany<Member>({
    model: "member",
    where: [{ field: "userId", value: userId }],
  })
  const blockers: Org[] = []
  for (const member of memberships) {
    if (!member.role.split(",").includes("owner")) continue
    const org = await db.findOne<Org>({
      model: "organization",
      where: [{ field: "id", value: member.organizationId }],
    })
    if (!org) continue
    const others = await db.count({
      model: "member",
      where: [
        { field: "organizationId", value: org.id },
        { field: "userId", value: userId, operator: "ne" },
      ],
    })
    if (org.slug !== personalSlug(userId) || others > 0) blockers.push(org)
  }
  return blockers
}

/** Throws the refusal the app shows, or returns when the account may be deleted. */
export async function assertCanDelete(
  db: Adapter,
  userId: string,
  billing: boolean,
): Promise<void> {
  const [blocker] = await blockingOrganizations(db, userId)
  if (blocker) {
    throw APIError.from("BAD_REQUEST", {
      message: `You own ${blocker.name}. Transfer or delete it first.`,
      code: OWNS_ORGANIZATION_CODE,
    })
  }
  const org = await db.findOne<Org>({
    model: "organization",
    where: [{ field: "slug", value: personalSlug(userId) }],
  })
  // Subscriptions exist only when the stripe plugin is mounted; its model is absent otherwise.
  if (!org || !billing) return
  const subs = await db.findMany<{ status: string }>({
    model: "subscription",
    where: [{ field: "referenceId", value: org.id }],
  })
  if (subs.some((s) => BILLING_STATUSES.includes(s.status))) {
    throw APIError.from("BAD_REQUEST", {
      message: "Cancel your subscription before deleting your account.",
      code: ACTIVE_SUBSCRIPTION_CODE,
    })
  }
}

/**
 * Removes the user's personal organization with them. Its members, invitations and app data
 * (projects, agents, runs, audit) go by cascade; API keys and SSO providers are keyed by organization
 * id with no foreign key, so they are removed here. Runs after assertCanDelete.
 */
export async function removePersonalOrganization(
  db: Adapter,
  userId: string,
  billing: boolean,
): Promise<void> {
  const org = await db.findOne<Org>({
    model: "organization",
    where: [{ field: "slug", value: personalSlug(userId) }],
  })
  if (!org) return
  await db.deleteMany({ model: "apikey", where: [{ field: "referenceId", value: org.id }] })
  await db.deleteMany({ model: "ssoProvider", where: [{ field: "organizationId", value: org.id }] })
  if (billing) {
    await db.deleteMany({ model: "subscription", where: [{ field: "referenceId", value: org.id }] })
  }
  await db.deleteMany({ model: "organization", where: [{ field: "id", value: org.id }] })
}

/** The address a change-of-email token replaces, when the token is one (else null). */
export function changeRequestOf(token: string): { oldEmail: string } | null {
  try {
    const payload = decodeJwt(token)
    if (payload.requestType !== "change-email-verification") return null
    if (typeof payload.updateTo !== "string" || typeof payload.email !== "string") return null
    return { oldEmail: payload.email }
  } catch {
    return null
  }
}

export function accountPlugin(opts: {
  notices: Notices
  adapter: () => Promise<Adapter>
  /** Whether the stripe plugin is mounted (its subscription model exists only then). */
  billing: boolean
}) {
  return {
    id: "starter-account",
    hooks: {
      before: [
        {
          matcher: (ctx: { path?: string }) => ctx.path === "/delete-user",
          handler: createAuthMiddleware(async (ctx) => {
            // Refused before the confirmation email goes out, not only when its link is opened.
            const session = await getSessionFromCtx(ctx)
            if (session) {
              await assertCanDelete(await opts.adapter(), session.user.id, opts.billing)
            }
          }),
        },
        {
          matcher: (ctx: { path?: string }) => ctx.path === "/unlink-account",
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx)
            const accountId = (ctx.body as { accountId?: unknown } | undefined)?.accountId
            if (!session || typeof accountId !== "string") return
            const db = await opts.adapter()
            const accounts = await db.findMany<{ id: string }>({
              model: "account",
              where: [{ field: "userId", value: session.user.id }],
            })
            // Not theirs (or unknown): better-auth answers ACCOUNT_NOT_FOUND.
            if (!accounts.some((a) => a.id === accountId)) return
            const remaining = accounts.filter((a) => a.id !== accountId).length
            const passkeys = await db.count({
              model: "passkey",
              where: [{ field: "userId", value: session.user.id }],
            })
            if (remaining === 0 && passkeys === 0) {
              throw APIError.from("BAD_REQUEST", {
                message:
                  "This is your only way to sign in. Add a password or a passkey before disconnecting it.",
                code: LAST_SIGN_IN_METHOD_CODE,
              })
            }
          }),
        },
      ],
      after: [
        {
          matcher: (ctx: { path?: string }) => ctx.path === "/change-email",
          handler: createAuthMiddleware(async (ctx) => {
            // After hooks also run for a refused request (same address, stale session): no notice then.
            if (ctx.context.returned instanceof APIError) return
            const session = await getSessionFromCtx(ctx)
            const newEmail = (ctx.body as { newEmail?: unknown } | undefined)?.newEmail
            if (!session || typeof newEmail !== "string") return
            await opts.notices.emailChangeRequested({
              to: session.user.email,
              newEmail: newEmail.toLowerCase(),
              name: session.user.name,
            })
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
}
