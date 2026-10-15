// Metering: calls per organization per UTC day, and the daily limit that applies. An organization is
// "unclaimed" while its owners' emails are unverified (provisional signups, see @starter/auth
// signup.ts). It gets the smaller limit until an owner claims the account.
import type { Caller } from "@starter/api"
import { type Database, member, user } from "@starter/db"
import { and, eq } from "drizzle-orm"

import { getUsage, incrementUsage } from "./data/usage"
import { inCallerOrg } from "./tenant"

export interface MeterLimits {
  /** Per organization per UTC day, once an owner has verified their email. */
  claimed: number
  /** Per organization per UTC day, while no owner has verified their email. */
  unclaimed: number
}

export interface OrgStatus {
  claimed: boolean
  limit: number
}

/** The UTC calendar day (`YYYY-MM-DD`) that usage is counted in. */
export const utcDay = (now: Date): string => now.toISOString().slice(0, 10)

/** Seconds from `now` until the next UTC midnight, when the daily counters reset (at least 1). */
export function secondsUntilReset(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000))
}

export interface Meter {
  limits: MeterLimits
  /** Whether the organization is claimed, and the daily limit that applies to it. */
  status(caller: Caller): Promise<OrgStatus>
  /** Count one call of `operation`; returns the status plus the day's total including this call. */
  consume(
    caller: Caller,
    operation: string,
    now?: Date,
  ): Promise<OrgStatus & { day: string; total: number }>
  /** The organization's calls so far today. */
  usageToday(caller: Caller, now?: Date): Promise<{ day: string; total: number }>
}

export function createMeter({ db, limits }: { db: Database; limits: MeterLimits }): Meter {
  // The lookup is memoized per caller object, which is created once per REST request or MCP call.
  const statuses = new WeakMap<Caller, Promise<OrgStatus>>()

  async function loadStatus(orgId: string): Promise<OrgStatus> {
    const owners = await db
      .select({ verified: user.emailVerified })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, orgId), eq(member.role, "owner")))
    const claimed = owners.some((o) => o.verified === true)
    return { claimed, limit: claimed ? limits.claimed : limits.unclaimed }
  }

  function status(caller: Caller): Promise<OrgStatus> {
    let cached = statuses.get(caller)
    if (!cached) {
      cached = loadStatus(caller.organizationId)
      statuses.set(caller, cached)
    }
    return cached
  }

  return {
    limits,
    status,
    async consume(caller, operation, now = new Date()) {
      const day = utcDay(now)
      const [current, total] = await Promise.all([
        status(caller),
        inCallerOrg(caller, (org, proof) => incrementUsage(db, org, proof, operation, day)),
      ])
      return { ...current, day, total }
    },
    async usageToday(caller, now = new Date()) {
      const day = utcDay(now)
      const { total } = await inCallerOrg(caller, (org, proof) => getUsage(db, org, proof, day))
      return { day, total }
    },
  }
}
