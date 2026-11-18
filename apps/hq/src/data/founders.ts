import type { Caller } from "@lab/api"
import { type Database, member, user } from "@lab/db"
import { and, eq, inArray, or, sql } from "drizzle-orm"

import { founders } from "../db/schema"

/**
 * Who the founders are: the rows of `hq.founders`, and nothing else. Every check (a session decides
 * a proposal, a key's owner reaches hq, a Slack click is mapped to a person) reads this table. hq's
 * sign-up is closed by default and open sign-up would make a stranger a person with a session, so
 * being signed in makes no one a founder.
 *
 * How a row is created: `syncFounders` at boot, from HQ_FOUNDERS. There is no operation, route or
 * page that writes the table, so no key and no unauthenticated caller can add a founder. To add or
 * remove a founder, change HQ_FOUNDERS and restart hq: the table is set to match the list.
 */

/** A Slack user id: `U` or `W` and capitals or digits. */
export const SLACK_USER_ID = /^[UW][A-Z0-9]+$/

/** One entry of HQ_FOUNDERS: who (by verified email, or user id) and their Slack user. */
export interface FounderSeed {
  who: { email: string } | { userId: string }
  slackUserId: string
}

/**
 * Parse HQ_FOUNDERS: comma-separated `<email>=<slack user id>` or `id:<user id>=<slack user id>`.
 * Empty or unset is no founders. A malformed entry, a repeated person or a repeated Slack user
 * throws: a founder list that is half understood must stop hq, never quietly shrink.
 */
export function parseFounders(value: string | undefined): FounderSeed[] {
  const seeds: FounderSeed[] = []
  const seen = new Set<string>()
  const slackSeen = new Set<string>()
  for (const raw of (value ?? "").split(",")) {
    const entry = raw.trim()
    if (entry === "") continue
    const at = entry.lastIndexOf("=")
    const left = at === -1 ? "" : entry.slice(0, at).trim()
    const slackUserId = at === -1 ? "" : entry.slice(at + 1).trim()
    if (left === "" || !SLACK_USER_ID.test(slackUserId)) {
      throw new Error(
        `HQ_FOUNDERS: "${entry}" is not <email>=<slack user id> or id:<user id>=<slack user id>`,
      )
    }
    const who = left.startsWith("id:")
      ? { userId: left.slice(3).trim() }
      : { email: left.toLowerCase() }
    const identity = "userId" in who ? `id:${who.userId}` : who.email
    if (identity === "id:" || seen.has(identity) || slackSeen.has(slackUserId)) {
      throw new Error(`HQ_FOUNDERS: "${entry}" repeats a person or a Slack user`)
    }
    seen.add(identity)
    slackSeen.add(slackUserId)
    seeds.push({ who, slackUserId })
  }
  return seeds
}

export interface FounderSync {
  /** User ids now in the table that were not before. */
  added: string[]
  /** User ids taken out because they are no longer listed (or no longer qualify). */
  removed: string[]
  /** Listed people who could not be resolved to a usable account, with why. */
  skipped: string[]
}

/**
 * Set the table to match the list. A listed person counts only as an existing, unbanned account;
 * an email also needs its address verified (anyone can sign up with an address they don't own).
 * Rows for anyone else are deleted, so removing a founder from HQ_FOUNDERS removes them at the
 * next boot, and an empty list leaves no founders: it fails closed. In one transaction.
 */
export function syncFounders(
  db: Database,
  seeds: readonly FounderSeed[],
  now: Date,
): Promise<FounderSync> {
  return db.transaction(async (tx) => {
    const wanted = new Map<string, string>()
    const skipped: string[] = []
    for (const seed of seeds) {
      const [row] = await tx
        .select({ id: user.id, verified: user.emailVerified, banned: user.banned })
        .from(user)
        .where("userId" in seed.who ? eq(user.id, seed.who.userId) : eq(user.email, seed.who.email))
      const label = "userId" in seed.who ? `id:${seed.who.userId}` : seed.who.email
      if (!row) skipped.push(`${label}: no such account yet`)
      else if (row.banned) skipped.push(`${label}: account is banned`)
      else if ("email" in seed.who && !row.verified) {
        skipped.push(`${label}: the address is not verified`)
      } else wanted.set(row.id, seed.slackUserId)
    }
    const existing = await tx.select().from(founders)
    const removed = existing.filter((f) => !wanted.has(f.userId)).map((f) => f.userId)
    if (removed.length > 0) await tx.delete(founders).where(inArray(founders.userId, removed))
    const changed = [...wanted].filter(
      ([userId, slackUserId]) =>
        existing.find((f) => f.userId === userId)?.slackUserId !== slackUserId,
    )
    if (changed.length > 0) {
      // A Slack user can move from one person to another in one pass: clear every row this
      // touches, then write the new ones.
      await tx.delete(founders).where(
        or(
          inArray(
            founders.userId,
            changed.map(([userId]) => userId),
          ),
          inArray(
            founders.slackUserId,
            changed.map(([, slackUserId]) => slackUserId),
          ),
        ),
      )
      await tx
        .insert(founders)
        .values(changed.map(([userId, slackUserId]) => ({ userId, slackUserId, createdAt: now })))
    }
    const added = changed
      .map(([userId]) => userId)
      .filter((userId) => !existing.some((f) => f.userId === userId))
    return { added, removed, skipped }
  })
}

/** Insert one founder row. What `syncFounders` does per person; tests use it to stand one up. */
export async function addFounder(
  db: Database,
  input: { userId: string; slackUserId: string; now: Date },
): Promise<void> {
  await db
    .insert(founders)
    .values({ userId: input.userId, slackUserId: input.slackUserId, createdAt: input.now })
    .onConflictDoUpdate({ target: founders.userId, set: { slackUserId: input.slackUserId } })
}

/** Whether this user is a founder: a row in the table, for an account that exists and is not banned. */
export async function isFounder(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: founders.userId })
    .from(founders)
    .innerJoin(user, eq(user.id, founders.userId))
    .where(and(eq(founders.userId, userId), sql`${user.banned} is not true`))
  return row !== undefined
}

/** The founder a Slack user is, or null: the mapping a click is decided under. */
export async function founderForSlackUser(
  db: Database,
  slackUserId: string,
): Promise<{ userId: string } | null> {
  const [row] = await db
    .select({ userId: founders.userId })
    .from(founders)
    .innerJoin(user, eq(user.id, founders.userId))
    .where(and(eq(founders.slackUserId, slackUserId), sql`${user.banned} is not true`))
  return row ?? null
}

/** Every founder's Slack user id, in a stable order: what the agent's founder list is derived from. */
export async function founderSlackUserIds(db: Database): Promise<string[]> {
  const rows = await db
    .select({ slackUserId: founders.slackUserId })
    .from(founders)
    .innerJoin(user, eq(user.id, founders.userId))
    .where(sql`${user.banned} is not true`)
  return rows.map((r) => r.slackUserId).sort()
}

/**
 * Whether a caller may use hq at all. The brain holds private facts and customers, so every caller
 * must trace back to a founder:
 *  - a person (a session, or an OAuth token they granted) must be a founder;
 *  - an API key acts for an organization, so the organization must be owned by a founder.
 */
export async function mayUseHq(
  db: Database,
  caller: Pick<Caller, "via" | "actor" | "organizationId">,
): Promise<boolean> {
  if (caller.actor.type === "user") return isFounder(db, caller.actor.userId)
  const owners = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, caller.organizationId), eq(member.role, "owner")))
  for (const owner of owners) if (await isFounder(db, owner.userId)) return true
  return false
}
