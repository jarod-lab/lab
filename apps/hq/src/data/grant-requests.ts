// Spend grant requests: what a Slack grant card is bound to. An agent asks (`request_spend_grant`,
// a key may call it) and hq records a pending request with the amount fixed HERE. A founder's click
// can only redeem that row by its id: once (an atomic claim), within a day, for the row's amount.
// A click names no amount that counts, and an id hq never recorded grants nothing. Every query on
// the table lives here.
import type { Database } from "@lab/db"
import { AppError } from "@lab/errors"
import { and, eq, gt, gte, sql } from "drizzle-orm"

import { spendGrantRequests } from "../db/schema"
import { columnText, formatUnits, parseUnits, type Units } from "./money"
import { dayOf, grantSpend } from "./spend"

/** The most one request (and so one click) may grant, in dollars. */
export const MAX_GRANT_REQUEST_USD = 25

/** A pending request stops being redeemable this long after it was made. */
export const GRANT_REQUEST_TTL_MS = 24 * 60 * 60 * 1000

/** How many requests a UTC day takes, in all: a key cannot fill the founders' Slack with cards. */
export const MAX_GRANT_REQUESTS_PER_DAY = 10

const MAX_REASON = 2000

export interface GrantRequest {
  id: string
  amount: Units
  expiresAt: Date
}

/**
 * Record a pending request. Counts the day's requests (any status) under a per-day advisory lock,
 * so two requests that arrive together cannot both take the last place; refuses the eleventh.
 */
export function requestSpendGrant(
  db: Database,
  input: { amount: Units; reason: string; runId?: string; requestedBy: string; now: Date },
): Promise<GrantRequest> {
  if (input.amount > MAX_GRANT_REQUEST_USD * 10_000) {
    throw new AppError("BAD_REQUEST", `A request can ask for at most $${MAX_GRANT_REQUEST_USD}`)
  }
  return db.transaction(async (tx) => {
    const day = dayOf(input.now)
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`hq_spend_grant_requests:${day}`}, 0))`,
    )
    const [made] = await tx
      .select({ n: sql<string>`count(*)::text` })
      .from(spendGrantRequests)
      .where(gte(spendGrantRequests.createdAt, new Date(`${day}T00:00:00Z`)))
    if (Number(made?.n ?? 0) >= MAX_GRANT_REQUESTS_PER_DAY) {
      throw new AppError(
        "RATE_LIMITED",
        `hq takes at most ${MAX_GRANT_REQUESTS_PER_DAY} grant requests a day`,
        { hint: "Ask in Slack, or wait for tomorrow (UTC)." },
      )
    }
    const id = crypto.randomUUID()
    await tx.insert(spendGrantRequests).values({
      id,
      amountUsd: columnText(input.amount),
      reason: input.reason.slice(0, MAX_REASON),
      runId: input.runId ?? null,
      status: "pending",
      requestedBy: input.requestedBy,
      createdAt: input.now,
    })
    return {
      id,
      amount: input.amount,
      expiresAt: new Date(input.now.getTime() + GRANT_REQUEST_TTL_MS),
    }
  })
}

/** What a click on a grant card did. */
export type GrantDecision =
  | { outcome: "granted"; amount: Units; grantId: string }
  | { outcome: "dismissed" }
  | { outcome: "unavailable"; why: "unknown" | "decided" | "expired" }

/**
 * Redeem a request by its id, as the founder `decidedBy`: grant it, or dismiss it. The claim is one
 * conditional UPDATE (pending, and made within the TTL), so of any number of clicks, at once or
 * replayed, exactly one wins; the grant is written in the same transaction as the claim. The
 * amount is the row's. An id that is not a recorded request, or is already decided or expired,
 * changes nothing.
 */
export function decideGrantRequest(
  db: Database,
  input: { id: string; approve: boolean; decidedBy: string; now: Date },
): Promise<GrantDecision> {
  return db.transaction(async (tx) => {
    const cutoff = new Date(input.now.getTime() - GRANT_REQUEST_TTL_MS)
    const [claimed] = await tx
      .update(spendGrantRequests)
      .set({
        status: input.approve ? "granted" : "rejected",
        decidedAt: input.now,
        decidedBy: input.decidedBy,
      })
      .where(
        and(
          eq(spendGrantRequests.id, input.id),
          eq(spendGrantRequests.status, "pending"),
          gt(spendGrantRequests.createdAt, cutoff),
        ),
      )
      .returning()
    if (!claimed) {
      const [row] = await tx
        .select()
        .from(spendGrantRequests)
        .where(eq(spendGrantRequests.id, input.id))
      if (!row) return { outcome: "unavailable" as const, why: "unknown" as const }
      if (row.status === "pending" || row.status === "expired") {
        // Pending past its day: close it, so the table says what happened.
        if (row.status === "pending") {
          await tx
            .update(spendGrantRequests)
            .set({ status: "expired", decidedAt: input.now })
            .where(and(eq(spendGrantRequests.id, row.id), eq(spendGrantRequests.status, "pending")))
        }
        return { outcome: "unavailable" as const, why: "expired" as const }
      }
      return { outcome: "unavailable" as const, why: "decided" as const }
    }
    if (!input.approve) return { outcome: "dismissed" as const }
    const amount = parseUnits(claimed.amountUsd)
    const grant = await grantSpend(tx, {
      amount,
      reason: `Slack approval ${claimed.id}: ${claimed.reason}`.slice(0, MAX_REASON),
      grantedBy: input.decidedBy,
      now: input.now,
    })
    return { outcome: "granted" as const, amount, grantId: grant.id }
  })
}

/** A request's amount as dollars text, for a reply to a founder. */
export const dollars = (amount: Units): string => `$${Number(formatUnits(amount)).toFixed(2)}`
