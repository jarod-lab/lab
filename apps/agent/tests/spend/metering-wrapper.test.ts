import { describe, expect, test } from "vitest"
import type { HqClient } from "#lib/hq/client.js"
import { DECISION_ESTIMATE_USD } from "#lib/spend/cap.js"
import {
  createSpendHooks,
  EMPTY_SPEND_STATE,
  type SpendState,
  type SpendStore,
} from "#lib/spend/hooks.js"
import { createMeteredDecide } from "#lib/spend/ledger.js"

/**
 * The decision-model wrapper itself, with the eve `decide()` replaced by a fake that is passed in
 * (no module mocking): the wrapper must return the call's answer and add its cost to the ledger.
 * A wrapper that stops metering fails these, which the source-text checks in metering.test.ts
 * cannot see.
 */
type Recorded = Parameters<HqClient["recordSpend"]>[0]

const setup = (state: Partial<SpendState> = {}) => {
  let current: SpendState = { ...EMPTY_SPEND_STATE, ...state }
  const store: SpendStore = {
    get: () => current,
    update: (fn) => {
      current = fn(current)
    },
  }
  const sent: Recorded[] = []
  const hq = {
    recordSpend: (input: Recorded) => {
      sent.push(input)
      return Promise.resolve({ id: "x", amountUsd: 0, estimated: false })
    },
  } as HqClient
  const ledger = createSpendHooks({
    hq: () => hq,
    store,
    estimateUsd: () => 0.1,
    modelId: () => "chat-model",
  })
  const answer = { answers: { team: { choice: "support" } } }
  let calls = 0
  const fakeDecide = (usage?: { costUsd?: number }) =>
    (() => {
      calls += 1
      return Promise.resolve({ ...answer, usage })
    }) as never
  return { store, sent, ledger, fakeDecide, calls: () => calls }
}

const metered = (ledger: ReturnType<typeof setup>["ledger"], decide: never) =>
  createMeteredDecide({ decide, ledger, model: "decision-model" })

describe("meteredDecide", () => {
  test("a build's decision call returns its answer and is recorded as build spend at the estimate", async () => {
    const t = setup()
    const decide = metered(t.ledger, t.fakeDecide({}))({ build: true })
    const result = await decide({} as never)
    expect(result).toMatchObject({ answers: { team: { choice: "support" } } })
    expect(t.sent).toEqual([
      {
        runId: undefined,
        source: "build",
        amountUsd: undefined,
        estimatedUsd: DECISION_ESTIMATE_USD,
        model: "decision-model",
      },
    ])
  })

  test("a reported cost is recorded as the cost, not the estimate", async () => {
    const t = setup()
    await metered(t.ledger, t.fakeDecide({ costUsd: 0.05 }))({ build: true })({} as never)
    expect(t.sent).toEqual([
      {
        runId: undefined,
        source: "build",
        amountUsd: 0.05,
        estimatedUsd: undefined,
        model: "decision-model",
      },
    ])
  })

  test("inside an open chat turn the call joins the turn's sum and nothing is sent yet", async () => {
    const t = setup({ kind: "eve", holdId: "hold-1", settled: false, estimateUsd: 0.1 })
    await metered(t.ledger, t.fakeDecide({}))()({} as never)
    expect(t.sent).toEqual([])
    expect(t.store.get().extraEstimatedUsd).toBeCloseTo(DECISION_ESTIMATE_USD, 6)
    await metered(t.ledger, t.fakeDecide({ costUsd: 0.05 }))()({} as never)
    expect(t.store.get().knownUsd).toBeCloseTo(0.05, 6)
    expect(t.store.get().withCost).toBe(1)
  })

  test("a call that throws is not swallowed and is not priced", async () => {
    const t = setup()
    const failing = (() => Promise.reject(new Error("the provider refused"))) as never
    await expect(metered(t.ledger, failing)({ build: true })({} as never)).rejects.toThrow(
      "the provider refused",
    )
    expect(t.sent).toEqual([])
    expect(t.store.get().extraEstimatedUsd).toBe(0)
  })

  test("metering that fails never fails the call: the answer is still returned", async () => {
    const t = setup()
    const broken = { decisionSpent: () => Promise.reject(new Error("hq is down")) }
    const decide = createMeteredDecide({
      decide: t.fakeDecide({}),
      ledger: broken,
      model: "decision-model",
    })
    const result = await decide({ build: true })({} as never)
    expect(result).toMatchObject({ answers: { team: { choice: "support" } } })
  })
})
