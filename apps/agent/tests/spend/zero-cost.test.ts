import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"
import type { HqClient } from "#lib/hq/client.js"
import { DECISION_ESTIMATE_USD } from "#lib/spend/cap.js"
import { createMeteredDecide } from "#lib/spend/ledger.js"
import {
  createSpendHooks,
  EMPTY_SPEND_STATE,
  type SpendHookContext,
  type SpendState,
  type SpendStore,
  type UsageEvent,
} from "#lib/spend/hooks.js"
import { tokenFloorUsd } from "#lib/spend/prices.js"
import { CALLERS } from "../helpers.js"
import { createHqFixture, type HqFixture } from "../hq/hq-fixture.js"

/**
 * A model that reports `costUsd: 0` must not make the daily cap inert. The real-service spike saw
 * the gateway report $0 on every haiku-5.5 call carrying ~12,000 input tokens. Against hq itself
 * (its real reservation arithmetic and ledger on PGlite): a zero cost is priced at the token
 * floor (`agent/lib/spend/prices.ts`), a missing cost never falls below its estimate, a positive
 * cost stands, and a decision call is counted once.
 */
let hq: HqFixture

beforeAll(async () => {
  hq = await createHqFixture()
}, 60_000)

afterAll(async () => {
  await hq.close()
})

beforeEach(() => {
  hq.newDay()
})

const HAIKU = "anthropic/claude-haiku-5.5"
/** A model id deliberately absent from the price table: it is priced at the unknown-model default. */
const NOT_IN_THE_TABLE = "test/model-not-in-the-price-table"

const memoryStore = (): SpendStore & { state: () => SpendState } => {
  let state: SpendState = { ...EMPTY_SPEND_STATE }
  return {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    state: () => state,
  }
}

let keySeq = 0
const context = (auth = CALLERS.untrusted, key?: string) => {
  const cancel = vi.fn<(reason?: string) => void>()
  const ctx: SpendHookContext = {
    session: { id: "session_1", auth: { current: auth } },
    channel: { kind: "channel:slack" },
    occurrence: { idempotencyKey: key ?? `zero-key-${++keySeq}` },
    cancel,
  }
  return { ctx, cancel }
}

const hooksFor = (model: string, client: () => HqClient = () => hq.client) => {
  const store = memoryStore()
  return {
    store,
    hooks: createSpendHooks({ hq: client, store, estimateUsd: () => 0.1, modelId: () => model }),
  }
}

const usage = (data: UsageEvent["data"]): UsageEvent => ({ data })

/** What the gateway sent on every haiku call: no cost, ~12,000 input tokens. */
const ZERO_COST_TURN = { costUsd: 0, inputTokens: 12_000, outputTokens: 0 } as const

const allowance = () => hq.client.getSpendAllowance()

const runCost = async () => (await hq.asAgent("GET", "/v1/runs")).body.runs?.[0]

type Hooks = ReturnType<typeof hooksFor>["hooks"]

/** One whole chat turn whose single model call reports `usageRecord`; true when it was let run. */
async function turn(hooks: Hooks, usageRecord: UsageEvent["data"]): Promise<boolean> {
  const start = context()
  await hooks.turnStarted({}, start.ctx)
  if (start.cancel.mock.calls.length > 0) {
    return false
  }
  await hooks.usageRecorded(usage(usageRecord), context().ctx)
  await hooks.turnSettled({ data: { outcome: "completed" } }, context().ctx)
  return true
}

describe("zero-cost turns trip the daily cap", () => {
  test("a model that reports costUsd 0 on 12,000 input tokens a turn trips $10/day, within 40 turns", async () => {
    const { hooks, store } = hooksFor(NOT_IN_THE_TABLE)
    const perTurn = tokenFloorUsd(NOT_IN_THE_TABLE, ZERO_COST_TURN)
    expect(perTurn).toBe(0.3)

    let refusedAt: number | undefined
    for (let i = 1; i <= 40 && refusedAt === undefined; i++) {
      if (
        !(await turn(hooks, { kind: "model", owner: { runId: `run_${i}` }, usage: ZERO_COST_TURN }))
      ) {
        refusedAt = i
      }
    }

    // 33 turns at $0.30 leave $0.10, which the 34th's $0.10 hold still fits; the 35th is refused.
    expect(refusedAt).toBe(35)
    const today = await allowance()
    expect(today.spentUsd).toBeCloseTo(34 * perTurn, 4)
    expect(today.spentUsd).toBeGreaterThanOrEqual(10)
    expect(today.reservedUsd).toBe(0)
    expect(store.state().refusal).toEqual({ remainingUsd: 0, unavailable: false })
  }, 60_000)

  test("the spike's real haiku-5.5 call (cache and output tokens too) is never charged $0", async () => {
    const { hooks } = hooksFor(HAIKU)
    const call = {
      costUsd: 0,
      inputTokens: 12_039,
      outputTokens: 24,
      cacheReadTokens: 11_926,
      cacheWriteTokens: 109,
    }
    expect(await turn(hooks, { kind: "model", owner: { runId: "run_0" }, usage: call })).toBe(true)
    expect((await allowance()).spentUsd).toBeCloseTo(tokenFloorUsd(HAIKU, call), 6)
    expect((await allowance()).spentUsd).toBeGreaterThan(0)
  })
})

describe("a zero cost never settles a hold at zero", () => {
  test("costUsd 0 with tokens settles the hold at the token floor, closed, not at $0.00", async () => {
    const { hooks } = hooksFor(NOT_IN_THE_TABLE)
    await turn(hooks, { kind: "model", usage: ZERO_COST_TURN })
    const today = await allowance()
    // The hold (0.10) settles at its estimate; the floor above it is recorded beside it.
    expect(today.spentUsd).toBeCloseTo(0.3, 4)
    expect(today.spentUsd).toBeGreaterThan(0)
    expect(today.reservedUsd).toBe(0)
  })

  test("a floor below the estimate settles the hold at the floor, not at the estimate and not at 0", async () => {
    const { hooks } = hooksFor(HAIKU)
    await turn(hooks, { kind: "model", usage: ZERO_COST_TURN })
    const today = await allowance()
    expect(today.spentUsd).toBeCloseTo(0.0012, 6)
    expect(today.reservedUsd).toBe(0)
    expect((await runCost())?.costUsd).toBeCloseTo(0.0012, 6)
  })

  test("costUsd 0 with no tokens is an unreported cost: the turn settles at its estimate, estimated", async () => {
    const { hooks } = hooksFor(HAIKU)
    await turn(hooks, { kind: "model", usage: { costUsd: 0 } })
    expect((await allowance()).spentUsd).toBeCloseTo(0.1, 4)
    expect((await runCost())?.costEstimated).toBe(true)
    hq.newDay()
    await turn(hooks, {
      kind: "model",
      usage: {
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    })
    expect((await allowance()).spentUsd).toBeCloseTo(0.1, 4)
  })

  test("two zero-cost records in one turn each count at their floor", async () => {
    const { hooks } = hooksFor(NOT_IN_THE_TABLE)
    await hooks.turnStarted({}, context().ctx)
    await hooks.usageRecorded(usage({ kind: "model", usage: ZERO_COST_TURN }), context().ctx)
    await hooks.usageRecorded(
      usage({ kind: "model", owner: { callId: "station" }, usage: ZERO_COST_TURN }),
      context().ctx,
    )
    await hooks.turnSettled({ data: { outcome: "completed" } }, context().ctx)
    expect((await allowance()).spentUsd).toBeCloseTo(0.6, 4)
  })

  test("zero-cost usage after the turn settled is recorded at its floor, not lost", async () => {
    const { hooks } = hooksFor(NOT_IN_THE_TABLE)
    await hooks.turnStarted({}, context().ctx)
    await hooks.turnSettled({ data: { outcome: "completed" } }, context().ctx)
    await hooks.usageRecorded(
      usage({ kind: "delegated-late", usage: ZERO_COST_TURN }),
      context().ctx,
    )
    // The turn's own hold settled at its estimate (0.10); the late zero-cost call adds its floor.
    expect((await allowance()).spentUsd).toBeCloseTo(0.1 + 0.3, 4)
  })

  test("a build's zero-cost call is recorded as build spend at its floor, outside the cap", async () => {
    const build = hooksFor(NOT_IN_THE_TABLE)
    await build.hooks.turnStarted({}, context(CALLERS.autonomous).ctx)
    await build.hooks.usageRecorded(
      usage({ kind: "model", usage: ZERO_COST_TURN }),
      context(CALLERS.autonomous).ctx,
    )
    // Build spend is outside the eve cap: today's eve spend did not move.
    expect((await allowance()).spentUsd).toBe(0)
    expect((await runCost())?.costUsd).toBeCloseTo(0.3, 4)
    expect((await runCost())?.costEstimated).toBe(true)
  })
})

describe("the positive and the missing cost paths are unchanged, only never lower", () => {
  test("a positive reported cost stands, even below the token floor", async () => {
    const { hooks } = hooksFor(NOT_IN_THE_TABLE)
    await turn(hooks, { kind: "model", usage: { ...ZERO_COST_TURN, costUsd: 0.0005 } })
    expect((await allowance()).spentUsd).toBeCloseTo(0.0005, 6)
    expect((await runCost())?.costEstimated).toBe(false)
  })

  test("a missing cost with few tokens still settles at the estimate, estimated", async () => {
    const { hooks } = hooksFor(HAIKU)
    await turn(hooks, { kind: "model", usage: { inputTokens: 500, outputTokens: 20 } })
    expect((await allowance()).spentUsd).toBeCloseTo(0.1, 4)
    expect((await runCost())?.costEstimated).toBe(true)
  })

  test("a missing cost whose tokens cost more than the estimate settles at the floor, estimated", async () => {
    const { hooks } = hooksFor(NOT_IN_THE_TABLE)
    await turn(hooks, { kind: "model", usage: { inputTokens: 12_000, outputTokens: 0 } })
    expect((await allowance()).spentUsd).toBeCloseTo(0.3, 4)
    expect((await runCost())?.costEstimated).toBe(true)
  })
})

describe("each decision call is counted once", () => {
  /** eve's `decide()` result: tokens, no cost. */
  const answer = {
    answers: { team: { choice: "support" } },
    usage: { inputTokens: 1_313, outputTokens: 40, totalTokens: 1_353 },
  }
  const decisionFloor = tokenFloorUsd(NOT_IN_THE_TABLE, { inputTokens: 1_313, outputTokens: 40 })

  test("inside a turn, eve's decision usage record and the metered call add one charge, not two", async () => {
    const { hooks } = hooksFor(HAIKU)
    await hooks.turnStarted({}, context().ctx)
    await hooks.usageRecorded(usage({ kind: "model", usage: { costUsd: 0.03 } }), context().ctx)
    // What eve emits for decide(): owner null, kind "decision", the gateway's cost.
    await hooks.usageRecorded(
      usage({
        kind: "decision",
        owner: null,
        usage: { costUsd: 0.0001313, inputTokens: 1_313, outputTokens: 40 },
      }),
      context().ctx,
    )
    const decide = createMeteredDecide({
      decide: (() => Promise.resolve(answer)) as never,
      ledger: hooks,
      model: NOT_IN_THE_TABLE,
    })
    await decide()({} as never)
    await hooks.turnSettled({ data: { outcome: "completed" } }, context().ctx)

    const expected = 0.03 + Math.max(DECISION_ESTIMATE_USD, decisionFloor)
    expect(decisionFloor).toBeGreaterThan(DECISION_ESTIMATE_USD)
    expect((await allowance()).spentUsd).toBeCloseTo(expected, 4)
  })

  test("the decision usage record alone adds nothing: the metered call is the only source", async () => {
    const { hooks } = hooksFor(HAIKU)
    await hooks.turnStarted({}, context().ctx)
    await hooks.usageRecorded(usage({ kind: "model", usage: { costUsd: 0.03 } }), context().ctx)
    const before = hq.client
    const sent: unknown[] = []
    const watching = {
      ...before,
      recordSpend: (input: Parameters<HqClient["recordSpend"]>[0]) => {
        sent.push(input)
        return before.recordSpend(input)
      },
    } as HqClient
    const probe = hooksFor(HAIKU, () => watching)
    await probe.hooks.usageRecorded(
      usage({ kind: "decision", owner: null, usage: { costUsd: 0.5, inputTokens: 1_313 } }),
      context().ctx,
    )
    expect(sent).toEqual([])
    await hooks.turnSettled({ data: { outcome: "completed" } }, context().ctx)
    expect((await allowance()).spentUsd).toBeCloseTo(0.03, 4)
  })

  test("outside a session eve emits no record: the metered call alone is recorded, once", async () => {
    const sent: Parameters<HqClient["recordSpend"]>[0][] = []
    const recorder = {
      recordSpend: (input: Parameters<HqClient["recordSpend"]>[0]) => {
        sent.push(input)
        return Promise.resolve({ id: "x", amountUsd: 0, estimated: false })
      },
    } as HqClient
    const { hooks } = hooksFor(HAIKU, () => recorder)
    const decide = createMeteredDecide({
      decide: (() => Promise.resolve(answer)) as never,
      ledger: hooks,
      model: NOT_IN_THE_TABLE,
    })
    await decide({ build: true })({} as never)
    expect(sent).toEqual([
      {
        runId: undefined,
        source: "build",
        amountUsd: undefined,
        estimatedUsd: Math.max(DECISION_ESTIMATE_USD, decisionFloor),
        model: NOT_IN_THE_TABLE,
      },
    ])
  })
})

describe("usage with no owner", () => {
  test("a record whose owner is null is counted once, at its floor, and does not crash", async () => {
    const { hooks } = hooksFor(NOT_IN_THE_TABLE)
    await hooks.turnStarted({}, context().ctx)
    const key = "null-owner-1"
    const record = usage({ kind: "model", owner: null, usage: ZERO_COST_TURN })
    await expect(hooks.usageRecorded(record, context(CALLERS.untrusted, key).ctx)).resolves.toBe(
      undefined,
    )
    // The same event delivered again (hooks are not exactly-once) adds nothing.
    await hooks.usageRecorded(record, context(CALLERS.untrusted, key).ctx)
    await hooks.turnSettled({ data: { outcome: "completed" } }, context().ctx)
    expect((await allowance()).spentUsd).toBeCloseTo(0.3, 4)
  })

  test("a null-owner record with no open hold (cache warming) is recorded once, not lost", async () => {
    const { hooks } = hooksFor(NOT_IN_THE_TABLE)
    const late = context(CALLERS.untrusted, "null-owner-late")
    const record = usage({ kind: "model", owner: null, usage: ZERO_COST_TURN })
    await hooks.usageRecorded(record, late.ctx)
    await hooks.usageRecorded(record, late.ctx)
    expect((await allowance()).spentUsd).toBeCloseTo(0.3, 4)
  })
})
