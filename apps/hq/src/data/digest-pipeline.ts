// The pipeline's part of the digest: what the work items did in a window, counted from rows.
// `readDigest` (data/digest.ts) calls this after its own reads; it is read-only.
//
// Honest data: every number is a count of rows. An item is "resolved" when the sweep moved it to
// `done`, which the machine allows only once its verification window passed with every contract
// item passing; a verifier that is not connected (`sentry`, `posthog`) can never pass, so it is
// never counted. The state of an item is no source for any count: only its history (the
// `work_item_events` rows) says what happened in a window. What waits for a founder is hq's own
// board rule (`workBoard`), not a second count.
//
// An hq deployed before the work migrations has no work tables: `workTablesExist` answers that in
// one query first, and the pipeline is `null`.
import type { Database } from "@lab/db"
import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm"

import { attempts, pullRequests, workItemEvents, workItems } from "../db/schema"
import { type Attention, displayId, type WorkState } from "../work/machine"
import { workTablesExist } from "./work-available"
import { pullRequestUrl, workBoard } from "./work-board"

export const MAX_NEEDS_YOU = 5
export const MAX_MERGED = 10
export const MAX_PIPELINE_EVENTS = 30

export type DigestMergedState = "merged" | "verifying" | "verified" | "reopened"
export type DigestEventResult = "opened" | "merged" | "reopened" | "verified" | "stopped"

export interface DigestPipelineRow {
  opened: number
  resolved: number
  reopened: number
  stuckAttempts: number
  needsYou: {
    kind: Attention
    itemId: string
    displayId: string
    title: string
    reason: string
    since: Date
  }[]
  needsYouTotal: number
  merged: {
    at: Date
    displayId: string
    title: string
    pullRequestUrl: string
    state: DigestMergedState
  }[]
  events: { at: Date; displayId: string; text: string; result: DigestEventResult }[]
}

/**
 * The item's state, said for a pull request it merged: the pull request is merged whatever
 * happened next, so only a state that adds a fact changes the word. An item that came back (it is
 * `reopened`, or moved on to triage and later after a merge) reads `reopened`; one a founder stopped
 * after the merge stays `merged`, because nothing else is known about it.
 */
function mergedState(state: WorkState): DigestMergedState {
  switch (state) {
    case "deploy":
    case "stopped":
      return "merged"
    case "verify":
      return "verifying"
    case "done":
      return "verified"
    default:
      return "reopened"
  }
}

/** Which of an item's moves the digest tells, by the state it moved to (and why, for deploy). */
const RESULT_BY_STATE: Partial<Record<WorkState, DigestEventResult>> = {
  triage: "opened",
  deploy: "merged",
  reopened: "reopened",
  done: "verified",
  stopped: "stopped",
}

/** The moves the digest tells; any other transition is not an event of the window. */
const TOLD = sql`(
  (${workItemEvents.toState} = 'triage' and ${workItemEvents.reason} = 'ingested')
  or (${workItemEvents.toState} = 'deploy' and ${workItemEvents.reason} = 'pull_request_merged')
  or ${workItemEvents.toState} in ('reopened', 'done', 'stopped')
)`

export async function readDigestPipeline(
  db: Database,
  input: { since: Date; until: Date },
): Promise<DigestPipelineRow | null> {
  if (!(await workTablesExist(db))) return null
  const { since, until } = input
  const inWindow = and(
    eq(workItemEvents.kind, "transition"),
    gte(workItemEvents.at, since),
    lt(workItemEvents.at, until),
  )

  const [counts] = await db
    .select({
      opened: sql<number>`(count(distinct ${workItemEvents.itemId}) filter (where ${workItemEvents.toState} = 'triage' and ${workItemEvents.reason} = 'ingested'))::int`,
      resolved: sql<number>`(count(distinct ${workItemEvents.itemId}) filter (where ${workItemEvents.toState} = 'done'))::int`,
      reopened: sql<number>`(count(distinct ${workItemEvents.itemId}) filter (where ${workItemEvents.toState} = 'reopened'))::int`,
    })
    .from(workItemEvents)
    .where(inWindow)

  // The sweep abandons exactly these (`listStaleAttempts`): a running attempt whose lease has run
  // out. A requested or finished attempt has no lease to lose.
  const [stuck] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(attempts)
    .where(and(eq(attempts.status, "running"), lte(attempts.leaseExpiresAt, until)))

  const board = await workBoard(db, until)

  const mergedRows = await db
    .select({
      at: pullRequests.mergedAt,
      number: pullRequests.number,
      url: pullRequests.url,
      itemNumber: workItems.number,
      repo: workItems.repo,
      title: workItems.title,
      state: workItems.state,
    })
    .from(pullRequests)
    .innerJoin(workItems, eq(workItems.id, pullRequests.itemId))
    .where(
      and(
        eq(pullRequests.state, "merged"),
        gte(pullRequests.mergedAt, since),
        lt(pullRequests.mergedAt, until),
      ),
    )
    .orderBy(desc(pullRequests.mergedAt), desc(pullRequests.id))
    .limit(MAX_MERGED)

  const eventRows = await db
    .select({
      at: workItemEvents.at,
      toState: workItemEvents.toState,
      itemNumber: workItems.number,
      title: workItems.title,
    })
    .from(workItemEvents)
    .innerJoin(workItems, eq(workItems.id, workItemEvents.itemId))
    .where(and(inWindow, TOLD))
    .orderBy(desc(workItemEvents.at), desc(workItemEvents.id))
    .limit(MAX_PIPELINE_EVENTS)

  return {
    opened: counts?.opened ?? 0,
    resolved: counts?.resolved ?? 0,
    reopened: counts?.reopened ?? 0,
    stuckAttempts: stuck?.n ?? 0,
    needsYou: board.needsYou.slice(0, MAX_NEEDS_YOU).map((n) => ({
      kind: n.kind,
      itemId: n.itemId,
      displayId: n.displayId,
      title: n.title,
      reason: n.reason,
      since: n.since,
    })),
    needsYouTotal: board.needsYou.length,
    merged: mergedRows.flatMap((r) =>
      r.at === null
        ? []
        : [
            {
              at: r.at,
              displayId: displayId(r.itemNumber),
              title: r.title,
              pullRequestUrl: pullRequestUrl(r.repo, r.number, r.url),
              state: mergedState(r.state),
            },
          ],
    ),
    events: eventRows.flatMap((e) => {
      const result = e.toState === null ? undefined : RESULT_BY_STATE[e.toState]
      return result === undefined
        ? []
        : [{ at: e.at, displayId: displayId(e.itemNumber), text: e.title, result }]
    }),
  }
}
