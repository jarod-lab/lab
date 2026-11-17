import type { SessionAuthContext } from "eve/context"
import type { HqClient, RunOutcome, RunSummary } from "../hq/client.js"
import { log } from "../log.js"
import { isAutonomous, isSummaryOnly } from "../trust.js"
import { BUILD_ESTIMATE_USD, checkCap, refusalText } from "./cap.js"

/**
 * The spend ledger's hooks: the cap before a turn, the cost after it.
 *
 * @remarks
 * Written against narrow structural types and an injected state store, so the unit tests drive them
 * without an eve runtime; `agent/hooks/spend.ts` binds them to eve's hooks and `defineState`.
 *
 * - `turn.started`: every turn is capped unless the dispatching channel stamped it as an unattended
 *   build (the autonomous principal): record the run, then reserve the estimate in hq. A refusal,
 *   an hq outage or a malformed answer cancels the turn before any model call (`ctx.cancel()`).
 * - `usage.recorded` fires once per model run and once per delegated call, so a turn's usage is
 *   summed in state and settled once, at `turn.settled`. Usage that arrives with no open hold
 *   (late delegated spend, a build) goes to `record_spend`. Hooks are not exactly-once: each
 *   record is keyed on `ctx.occurrence.idempotencyKey` and skipped when seen. hq's `record_spend`
 *   has no idempotency field, so this guard is best effort (see the report).
 * - Every hq call after the reservation is wrapped: a throwing hook fails the turn. Cost is never
 *   dropped silently: a failed `record_spend` waits in state and is retried by the next hook.
 */

/** Builds are outside the daily cap; they record their cost as `build` spend. */
export type TurnKind = "eve" | "build"

/** A `record_spend` that failed and is retried by the next hook. */
export interface PendingRecord {
  key: string
  source: "eve" | "build"
  amountUsd?: number
  estimatedUsd?: number
  model: string
}

export interface SpendState {
  kind: TurnKind | null
  runId: string | null
  /** The open hold, until the turn settles. */
  holdId: string | null
  estimateUsd: number
  /** Sum of the costs usage records reported this turn. */
  knownUsd: number
  /** How many records reported a cost, and how many did not. */
  withCost: number
  withoutCost: number
  /** Idempotency keys already handled (the last 200). */
  seen: string[]
  pending: PendingRecord[]
  /** True once the turn settled: later usage is recorded, not summed. */
  settled: boolean
  /**
   * Set when this turn was refused. The Slack channel reads it to tell the thread why, because a
   * cancelled turn's `turn.settled` carries no cause naming the hook (observed under `eve eval`).
   */
  refusal: { remainingUsd: number; unavailable: boolean } | null
}

export const EMPTY_SPEND_STATE: SpendState = {
  kind: null,
  runId: null,
  holdId: null,
  estimateUsd: 0,
  knownUsd: 0,
  withCost: 0,
  withoutCost: 0,
  seen: [],
  pending: [],
  settled: true,
  refusal: null,
}

export interface SpendStore {
  get(): SpendState
  update(fn: (state: SpendState) => SpendState): void
}

/** What the hooks read of eve's hook context. */
export interface SpendHookContext {
  readonly session: {
    readonly id: string
    readonly auth: { readonly current: SessionAuthContext | null }
  }
  readonly channel: { readonly kind?: string }
  readonly occurrence: { readonly idempotencyKey: string }
  cancel(reason?: string): void
}

export interface UsageEvent {
  data: {
    owner?: { runId: string } | { callId: string } | { changeId: string }
    kind: string
    usage: { costUsd?: number }
  }
}

export interface TurnSettledEvent {
  data: { outcome: "completed" | "failed" | "cancelled" }
}

export interface SpendHookDeps {
  /** Resolved per call: a missing key or URL fails closed in the turn, not at load. */
  hq: () => HqClient
  store: SpendStore
  /** What a turn is assumed to cost until known (dollars). */
  estimateUsd: () => number
  /** The model name recorded with the cost. */
  modelId: () => string
}

const SEEN_LIMIT = 200
const SETTLE_ATTEMPTS = 2

/**
 * Whether a turn is an unattended build (outside the daily cap) or capped (chat, schedules, and the
 * summary of a pull request anyone opened: that run is not a build, and its trigger is the least
 * trusted input there is, so it stays under the cap).
 */
export function classify(auth: SessionAuthContext | null): TurnKind {
  return isAutonomous(auth) && !isSummaryOnly(auth) ? "build" : "eve"
}

/** hq refuses one call over this many dollars; larger costs go in several calls. */
export const MAX_CALL_USD = 1000

/** An amount as calls hq accepts: pieces of at most MAX_CALL_USD that add up to the whole. */
export function inCalls(amountUsd: number): number[] {
  const pieces: number[] = []
  let left = Math.round(amountUsd * 10_000)
  const most = MAX_CALL_USD * 10_000
  while (left > most) {
    pieces.push(MAX_CALL_USD)
    left -= most
  }
  pieces.push(left / 10_000)
  return pieces
}

const costOf = (usage: { costUsd?: number }): number | undefined =>
  typeof usage.costUsd === "number" && Number.isFinite(usage.costUsd) && usage.costUsd >= 0
    ? usage.costUsd
    : undefined

/**
 * What to settle a turn at: the summed cost when every record reported one; otherwise the estimate
 * (`undefined`, which hq settles at the hold's estimate, marked estimated), unless what was
 * reported already exceeds it. A missing cost is never taken as zero.
 */
export function settlementAmount(state: SpendState): number | undefined {
  if (state.withoutCost === 0 && state.withCost > 0) {
    return state.knownUsd
  }
  return state.knownUsd > state.estimateUsd ? state.knownUsd : undefined
}

const OUTCOMES: Record<TurnSettledEvent["data"]["outcome"], RunOutcome> = {
  completed: "succeeded",
  failed: "failed",
  cancelled: "stopped",
}

export function createSpendHooks(deps: SpendHookDeps) {
  const { store } = deps

  const seen = (key: string) => store.get().seen.includes(key)
  const remember = (key: string) =>
    store.update((s) => ({ ...s, seen: [...s.seen, key].slice(-SEEN_LIMIT) }))

  /** Sends one `record_spend`; a failure parks it in state for the next hook. */
  async function record(entry: PendingRecord): Promise<void> {
    // hq takes at most MAX_CALL_USD a call: a larger cost goes in pieces, none of it dropped.
    if (entry.amountUsd !== undefined && entry.amountUsd > MAX_CALL_USD) {
      for (const piece of inCalls(entry.amountUsd)) {
        await record({ ...entry, amountUsd: piece })
      }
      return
    }
    try {
      await deps.hq().recordSpend({
        runId: store.get().runId ?? undefined,
        source: entry.source,
        amountUsd: entry.amountUsd,
        estimatedUsd: entry.estimatedUsd,
        model: entry.model,
      })
    } catch (error) {
      log.warn("spend: record_spend failed, will retry", error)
      store.update((s) => ({ ...s, pending: [...s.pending, entry] }))
    }
  }

  async function retryPending(): Promise<void> {
    const waiting = store.get().pending
    if (waiting.length === 0) {
      return
    }
    store.update((s) => ({ ...s, pending: [] }))
    for (const entry of waiting) {
      await record(entry)
    }
  }

  async function turnStarted(_event: unknown, ctx: SpendHookContext): Promise<void> {
    const kind = classify(ctx.session.auth.current)
    const estimateUsd = deps.estimateUsd()
    let runId: string | null = null
    try {
      const run = await deps.hq().recordRun({
        task: kind === "build" ? "build" : "chat",
        trigger: ctx.channel.kind ?? "unknown",
        runner: kind === "build" ? "sandbox" : "eve",
      })
      runId = run.id
    } catch (error) {
      // A run row is bookkeeping: the turn does not depend on it.
      log.warn("spend: record_run failed", error)
    }
    const carried = store.get()
    store.update(() => ({
      ...EMPTY_SPEND_STATE,
      kind,
      runId,
      estimateUsd,
      settled: false,
      seen: carried.seen,
      pending: carried.pending,
    }))
    if (kind === "build") {
      return
    }

    let hq: HqClient
    try {
      hq = deps.hq()
    } catch {
      // No hq URL or key configured: the cap cannot be checked, so the turn does not run.
      store.update((s) => ({
        ...s,
        settled: true,
        refusal: { remainingUsd: 0, unavailable: true },
      }))
      ctx.cancel(refusalText({ remainingUsd: 0, unavailable: true }))
      return
    }
    const result = await checkCap(hq, estimateUsd, { runId: runId ?? undefined })
    if (result.allowed) {
      store.update((s) => ({ ...s, holdId: result.holdId }))
      return
    }
    store.update((s) => ({
      ...s,
      settled: true,
      refusal: { remainingUsd: result.remainingUsd, unavailable: result.unavailable === true },
    }))
    ctx.cancel(refusalText(result))
    if (runId !== null) {
      try {
        await hq.finishRun({
          id: runId,
          outcome: "stopped",
          summary: {
            worked: [],
            failed: [],
            stop: [
              result.unavailable ? "spend cap could not be checked" : "daily spend cap reached",
            ],
          },
        })
      } catch (error) {
        log.warn("spend: finish_run failed", error)
      }
    }
  }

  async function usageRecorded(event: UsageEvent, ctx: SpendHookContext): Promise<void> {
    const key = ctx.occurrence.idempotencyKey
    if (seen(key)) {
      return
    }
    remember(key)
    await retryPending()
    const state = store.get()
    const cost = costOf(event.data.usage)
    const model =
      "owner" in event.data && event.data.owner && "callId" in event.data.owner
        ? "delegated"
        : deps.modelId()

    if (state.kind === "eve" && state.holdId !== null && !state.settled) {
      store.update((s) => ({
        ...s,
        knownUsd: s.knownUsd + (cost ?? 0),
        withCost: s.withCost + (cost === undefined ? 0 : 1),
        withoutCost: s.withoutCost + (cost === undefined ? 1 : 0),
      }))
      return
    }

    // No open hold: a build, or spend that arrives after its turn settled. Never lose it.
    const source = state.kind === "build" ? "build" : "eve"
    const fallback =
      source === "build" ? BUILD_ESTIMATE_USD : Math.max(state.estimateUsd, deps.estimateUsd())
    await record({
      key,
      source,
      amountUsd: cost,
      estimatedUsd: cost === undefined ? fallback : undefined,
      model,
    })
  }

  async function turnSettled(event: TurnSettledEvent, ctx: SpendHookContext): Promise<void> {
    const key = ctx.occurrence.idempotencyKey
    if (seen(key)) {
      return
    }
    remember(key)
    await retryPending()
    const state = store.get()
    if (state.kind === null || state.settled) {
      return
    }
    store.update((s) => ({ ...s, settled: true }))

    if (state.holdId !== null) {
      let settledOk = false
      const amount = settlementAmount(state)
      // The hold settles up to one call's limit; the rest is recorded against the same run.
      const settledAt = amount === undefined ? undefined : Math.min(amount, MAX_CALL_USD)
      for (let attempt = 0; attempt < SETTLE_ATTEMPTS && !settledOk; attempt++) {
        try {
          await deps.hq().settleSpend({
            holdId: state.holdId,
            amountUsd: settledAt,
            model: deps.modelId(),
          })
          settledOk = true
          if (amount !== undefined && amount > MAX_CALL_USD) {
            await record({
              key: ctx.occurrence.idempotencyKey,
              source: "eve",
              amountUsd: Math.round((amount - MAX_CALL_USD) * 10_000) / 10_000,
              model: deps.modelId(),
            })
          }
        } catch (error) {
          // A second settle is a CONFLICT: the hold is already closed, nothing more to do.
          if (error instanceof Error && "code" in error && error.code === "CONFLICT") {
            settledOk = true
          } else {
            log.warn("spend: settle_spend failed", error)
          }
        }
      }
      // An unsettled hold still counts at its estimate in hq after 15 minutes; it is not lost.
      store.update((s) => ({ ...s, holdId: null }))
    }

    if (state.runId !== null) {
      const summary: RunSummary = {
        worked: event.data.outcome === "completed" ? ["turn completed"] : [],
        failed: event.data.outcome === "failed" ? ["turn failed"] : [],
        stop: event.data.outcome === "cancelled" ? ["turn cancelled"] : [],
      }
      try {
        await deps
          .hq()
          .finishRun({ id: state.runId, outcome: OUTCOMES[event.data.outcome], summary })
      } catch (error) {
        log.warn("spend: finish_run failed", error)
      }
    }
  }

  return { turnStarted, usageRecorded, turnSettled }
}
