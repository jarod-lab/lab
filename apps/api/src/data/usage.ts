// Usage metering: calls per organization, per UTC day, per operation.
import type { CallerActsFor, Named, OrganizationId } from "@starter/auth-proofs"
import { type Database, usageDaily } from "@starter/db"
import { and, eq, sql } from "drizzle-orm"

const NOTICE_PREFIX = "notice:"

/**
 * Claims the once-a-day notice `notice` for the organization: true for exactly one caller per day,
 * however many race. A marker row (count 0) with the unique key on (org, day, operation) is inserted
 * with ON CONFLICT DO NOTHING, and only the insert that lands gets a row back. Markers are not counted
 * (dayTotal skips them).
 */
export async function claimNotice<O>(
  db: Database,
  org: Named<O, OrganizationId>,
  _proof: CallerActsFor<O>,
  notice: string,
  day: string,
): Promise<boolean> {
  const claimed = await db
    .insert(usageDaily)
    .values({ organizationId: org.value, day, operation: `${NOTICE_PREFIX}${notice}`, count: 0 })
    .onConflictDoNothing()
    .returning({ operation: usageDaily.operation })
  return claimed.length > 0
}

/** Count one call and return the organization's total for that UTC day, across operations. */
export async function incrementUsage<O>(
  db: Database,
  org: Named<O, OrganizationId>,
  _proof: CallerActsFor<O>,
  operation: string,
  day: string,
): Promise<number> {
  await db
    .insert(usageDaily)
    .values({ organizationId: org.value, day, operation, count: 1 })
    .onConflictDoUpdate({
      target: [usageDaily.organizationId, usageDaily.day, usageDaily.operation],
      set: { count: sql`${usageDaily.count} + 1` },
    })
  const { total } = await dayTotal(db, org.value, day)
  return total
}

/** The organization's calls on one UTC day: the total, and the count per operation. */
export async function getUsage<O>(
  db: Database,
  org: Named<O, OrganizationId>,
  _proof: CallerActsFor<O>,
  day: string,
): Promise<{ total: number; byOperation: Record<string, number> }> {
  return dayTotal(db, org.value, day)
}

async function dayTotal(db: Database, organizationId: string, day: string) {
  const rows = await db
    .select({ operation: usageDaily.operation, count: usageDaily.count })
    .from(usageDaily)
    .where(and(eq(usageDaily.organizationId, organizationId), eq(usageDaily.day, day)))
  const byOperation: Record<string, number> = {}
  let total = 0
  for (const row of rows) {
    // Notice markers (see claimNotice) are not operations.
    if (row.operation.startsWith(NOTICE_PREFIX)) continue
    byOperation[row.operation] = row.count
    total += row.count
  }
  return { total, byOperation }
}
