import type { Caller } from "@lab/api"
import { type Database, member, user } from "@lab/db"
import { and, eq } from "drizzle-orm"

/**
 * Who the founders are: a configured allowlist (HQ_FOUNDER_USER_IDS, HQ_FOUNDER_EMAILS). hq's
 * sign-up is open, so anyone who signs up is a person with a session and an organization of their
 * own; only a founder's decision counts here. Empty means nobody is a founder.
 */
export interface FounderPolicy {
  userIds: readonly string[]
  /** Lower-case. An address counts only once the account has verified it. */
  emails: readonly string[]
}

export const NO_FOUNDERS: FounderPolicy = { userIds: [], emails: [] }

/**
 * Whether this user is a founder. A user id on the list is enough. An email on the list is not:
 * anyone can sign up with an address they don't own, so it must also be a verified one.
 */
export async function isFounder(
  db: Database,
  policy: FounderPolicy,
  userId: string,
): Promise<boolean> {
  if (policy.userIds.includes(userId)) return true
  if (policy.emails.length === 0) return false
  const [row] = await db
    .select({ email: user.email, verified: user.emailVerified, banned: user.banned })
    .from(user)
    .where(eq(user.id, userId))
  return !!row && row.verified && !row.banned && policy.emails.includes(row.email.toLowerCase())
}

/**
 * Whether a caller may use hq at all. The brain holds private facts and customers, and hq's
 * sign-up is open, so every caller must trace back to a founder:
 *  - a person (a session, or an OAuth token they granted) must be a founder;
 *  - an API key acts for an organization, and anyone can mint a key in the personal organization
 *    their sign-up gave them, so the organization must be owned by a founder.
 */
export async function mayUseHq(
  db: Database,
  policy: FounderPolicy,
  caller: Pick<Caller, "via" | "actor" | "organizationId">,
): Promise<boolean> {
  // A person, in a browser or through an OAuth client: they must be a founder themselves.
  if (caller.actor.type === "user") return isFounder(db, policy, caller.actor.userId)
  const owners = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, caller.organizationId), eq(member.role, "owner")))
  for (const owner of owners) if (await isFounder(db, policy, owner.userId)) return true
  return false
}
