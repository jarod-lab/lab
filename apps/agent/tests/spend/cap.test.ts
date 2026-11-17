import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"
import type { HqClient } from "#lib/hq/client.js"
import { checkCap, refusalText } from "#lib/spend/cap.js"
import {
  classify,
  createSpendHooks,
  EMPTY_SPEND_STATE,
  type SpendHookContext,
  type SpendState,
  type SpendStore,
} from "#lib/spend/hooks.js"
import { CALLERS } from "../helpers.js"
import { createHqFixture, type HqFixture } from "../hq/hq-fixture.js"

/**
 * The daily cap and the ledger against hq itself (its real reservation arithmetic and ledger on
 * PGlite). hq's own tests prove the race and the arithmetic; these prove the agent asks, obeys a
 * refusal before any model call, and never loses or zeroes a cost.
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
    occurrence: { idempotencyKey: key ?? `key-${++keySeq}` },
    cancel,
  }
  return { ctx, cancel }
}

const hooksOn = (client: () => HqClient, store = memoryStore()) => ({
  store,
  hooks: createSpendHooks({
    hq: client,
    store,
    estimateUsd: () => 0.1,
    modelId: () => "test-model",
  }),
})

/** Spends `amountUsd` of today's eve cap, as a finished turn would have. */
const spendToday = (amountUsd: number) =>
  hq.client.recordSpend({ source: "eve", amountUsd, model: "setup" })

const allowance = () => hq.client.getSpendAllowance()

const runCost = async () => {
  const runs = await hq.asAgent("GET", "/v1/runs")
  return runs.body.runs?.[0]
}

describe("checkCap", () => {
  test("allows when remaining exceeds the estimate", async () => {
    await spendToday(9.5)
    const result = await checkCap(hq.client, 0.1)
    expect(result).toEqual({ allowed: true, holdId: expect.any(String) })
    expect((await allowance()).reservedUsd).toBeCloseTo(0.1, 4)
  })

  test("refuses at exactly 10.00 spent", async () => {
    await spendToday(10)
    const result = await checkCap(hq.client, 0.01)
    expect(result).toEqual({ allowed: false, remainingUsd: 0 })
    expect((await allowance()).reservedUsd).toBe(0)
  })

  test("a grant raises today's remaining", async () => {
    await spendToday(10)
    expect((await checkCap(hq.client, 0.5)).allowed).toBe(false)
    const grant = await hq.asFounder("POST", "/v1/spend/grants", {
      amountUsd: 5,
      reason: "launch day",
    })
    expect(grant.status).toBe(200)
    expect((await allowance()).remainingUsd).toBe(5)
    expect((await checkCap(hq.client, 0.5)).allowed).toBe(true)
  })

  test("an hq that cannot be asked is a refusal, never a pass", async () => {
    const down: Pick<HqClient, "reserveSpend"> = {
      reserveSpend: () => Promise.reject(new Error("connect ECONNREFUSED")),
    }
    expect(await checkCap(down, 0.1)).toEqual({
      allowed: false,
      remainingUsd: 0,
      unavailable: true,
    })
    const garbled: Pick<HqClient, "reserveSpend"> = {
      reserveSpend: () => Promise.resolve({ holdId: "" }),
    }
    expect((await checkCap(garbled, 0.1)).allowed).toBe(false)
  })
})

describe("the turn.started hook", () => {
  test("a refused reservation cancels the turn before any model call", async () => {
    await spendToday(10)
    const { hooks, store } = hooksOn(() => hq.client)
    const { ctx, cancel } = context()
    await hooks.turnStarted({}, ctx)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel.mock.calls[0]?.[0]).toContain("$0.00")
    expect(store.state().holdId).toBeNull()
    // Nothing was held, so no model call has anything to be paid from.
    expect((await allowance()).reservedUsd).toBe(0)
    // The refused run is closed as stopped.
    expect((await runCost())?.outcome).toBe("stopped")
  })

  test("an hq outage cancels the turn: the cap that cannot be checked is not skipped", async () => {
    const { hooks } = hooksOn(() => {
      throw new Error("HQ_BASE_URL is not set")
    })
    const { ctx, cancel } = context()
    await hooks.turnStarted({}, ctx)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel.mock.calls[0]?.[0]).toBe(refusalText({ remainingUsd: 0, unavailable: true }))
  })

  test("an allowed turn holds its estimate and is not cancelled", async () => {
    const { hooks, store } = hooksOn(() => hq.client)
    const { ctx, cancel } = context()
    await hooks.turnStarted({}, ctx)
    expect(cancel).not.toHaveBeenCalled()
    expect(store.state().holdId).toEqual(expect.any(String))
    expect((await allowance()).reservedUsd).toBeCloseTo(0.1, 4)
  })

  test("every caller is capped except the unattended build principal", () => {
    expect(classify(CALLERS.untrusted)).toBe("eve")
    expect(classify(CALLERS.trusted)).toBe("eve")
    expect(classify(CALLERS.schedule)).toBe("eve")
    expect(classify(CALLERS.anonymous)).toBe("eve")
    expect(classify(CALLERS.autonomous)).toBe("build")
    expect(classify(CALLERS.ticket)).toBe("build")
  })
})

describe("settling a turn", () => {
  test("a turn whose model call reports no costUsd settles at the estimate", async () => {
    const { hooks } = hooksOn(() => hq.client)
    const start = context()
    await hooks.turnStarted({}, start.ctx)
    await hooks.usageRecorded({ data: { kind: "model", usage: {} } }, context().ctx)
    await hooks.turnSettled({ data: { outcome: "completed" } }, context().ctx)

    const today = await allowance()
    expect(today.spentUsd).toBeCloseTo(0.1, 4)
    expect(today.reservedUsd).toBe(0)
    const run = await runCost()
    expect(run?.costUsd).toBeCloseTo(0.1, 4)
    expect(run?.costEstimated).toBe(true)
    expect(run?.outcome).toBe("succeeded")
  })

  test("the turn's usage is summed and settled once, at the real cost", async () => {
    const { hooks } = hooksOn(() => hq.client)
    await hooks.turnStarted({}, context().ctx)
    await hooks.usageRecorded({ data: { kind: "model", usage: { costUsd: 0.03 } } }, context().ctx)
    await hooks.usageRecorded(
      { data: { kind: "model", owner: { callId: "c1" }, usage: { costUsd: 0.045 } } },
      context().ctx,
    )
    await hooks.turnSettled({ data: { outcome: "completed" } }, context().ctx)
    const today = await allowance()
    expect(today.spentUsd).toBeCloseTo(0.075, 4)
    expect((await runCost())?.costEstimated).toBe(false)
  })

  test("some records without a cost settle at the estimate, never below what was reported", async () => {
    const { hooks } = hooksOn(() => hq.client)
    await hooks.turnStarted({}, context().ctx)
    await hooks.usageRecorded({ data: { kind: "model", usage: { costUsd: 0.02 } } }, context().ctx)
    await hooks.usageRecorded({ data: { kind: "model", usage: {} } }, context().ctx)
    await hooks.turnSettled({ data: { outcome: "completed" } }, context().ctx)
    expect((await allowance()).spentUsd).toBeCloseTo(0.1, 4)
  })

  test("usage that arrives after the turn settled is recorded once, not lost", async () => {
    const { hooks } = hooksOn(() => hq.client)
    await hooks.turnStarted({}, context().ctx)
    await hooks.turnSettled({ data: { outcome: "completed" } }, context().ctx)
    const late = context(CALLERS.untrusted, "late-1")
    await hooks.usageRecorded(
      { data: { kind: "delegated-late", usage: { costUsd: 0.04 } } },
      late.ctx,
    )
    // The same event delivered again (hooks are not exactly-once) adds nothing.
    await hooks.usageRecorded(
      { data: { kind: "delegated-late", usage: { costUsd: 0.04 } } },
      late.ctx,
    )
    expect((await allowance()).spentUsd).toBeCloseTo(0.1 + 0.04, 4)
  })

  test("a settle delivered twice does not settle twice", async () => {
    const { hooks } = hooksOn(() => hq.client)
    await hooks.turnStarted({}, context().ctx)
    const settled = context(CALLERS.untrusted, "settled-1")
    await hooks.turnSettled({ data: { outcome: "completed" } }, settled.ctx)
    await hooks.turnSettled({ data: { outcome: "completed" } }, settled.ctx)
    expect((await allowance()).spentUsd).toBeCloseTo(0.1, 4)
  })

  test("a failing hq never throws out of a hook and the held estimate still counts", async () => {
    const real = hooksOn(() => hq.client)
    await real.hooks.turnStarted({}, context().ctx)
    const broken = createSpendHooks({
      hq: () => {
        throw new Error("hq is down")
      },
      store: real.store,
      estimateUsd: () => 0.1,
      modelId: () => "test-model",
    })
    await expect(
      broken.usageRecorded({ data: { kind: "model", usage: { costUsd: 0.03 } } }, context().ctx),
    ).resolves.toBeUndefined()
    await expect(
      broken.turnSettled({ data: { outcome: "completed" } }, context().ctx),
    ).resolves.toBeUndefined()
    // The hold was never settled, so it still counts at its estimate: nothing is lost.
    expect((await allowance()).reservedUsd).toBeCloseTo(0.1, 4)
  })
})

describe("unattended builds", () => {
  test("a build is not reserved against the cap and its cost is recorded as build spend", async () => {
    await spendToday(10)
    const { hooks } = hooksOn(() => hq.client)
    const { ctx, cancel } = context(CALLERS.autonomous)
    await hooks.turnStarted({}, ctx)
    expect(cancel).not.toHaveBeenCalled()
    await hooks.usageRecorded(
      { data: { kind: "model", usage: { costUsd: 0.4 } } },
      context(CALLERS.autonomous).ctx,
    )
    await hooks.usageRecorded(
      { data: { kind: "model", usage: {} } },
      context(CALLERS.autonomous).ctx,
    )
    const today = await allowance()
    // Build spend is outside the eve cap: the day is still at exactly 10.00.
    expect(today.spentUsd).toBe(10)
    expect(today.reservedUsd).toBe(0)
    const run = await runCost()
    expect(run?.costUsd).toBeCloseTo(0.4 + 0.25, 4)
    expect(run?.costEstimated).toBe(true)
  })
})
