import { describe, expect, test, vi } from "vitest"
import { DEFAULT_TURN_ESTIMATE_USD, normalTurnUsd, turnEstimateUsd } from "#lib/spend/cap.js"
import { MODELS } from "#lib/models.js"
import {
  hasTokens,
  MODEL_PRICES,
  NORMAL_TURN_TOKENS,
  priceOf,
  priceUsage,
  reportedCost,
  tokenFloorUsd,
  UNKNOWN_MODEL_PRICE,
} from "#lib/spend/prices.js"

/**
 * The token floor under a cost the gateway reports as zero (`agent/lib/spend/prices.ts`). The rule
 * these pin: a positive reported cost stands; a zero or missing cost on a call with tokens is never
 * free; a zero or missing cost with no tokens is unreported, so the turn's estimate stands.
 */
const HAIKU = "anthropic/claude-haiku-5.5"
const NOT_IN_THE_TABLE = "test/model-not-in-the-price-table"

/** The usage record the spike saw on a real haiku-5.5 call: costUsd 0 beside ~12,000 tokens. */
const SPIKE_CALL = {
  costUsd: 0,
  inputTokens: 12_039,
  outputTokens: 24,
  cacheReadTokens: 11_926,
  cacheWriteTokens: 109,
}

describe("the price table", () => {
  test("haiku-5.5 is at the gateway's list price, 0.1 in and 0.5 out per million tokens", () => {
    expect(MODEL_PRICES[HAIKU]).toMatchObject({ input: 0.1, output: 0.5 })
    expect(priceOf(HAIKU)).toBe(MODEL_PRICES[HAIKU])
    expect(priceOf(` ${HAIKU.toUpperCase()} `)).toBe(MODEL_PRICES[HAIKU])
  })

  test("an unknown model is priced above every model in the table, never below", () => {
    expect(priceOf(NOT_IN_THE_TABLE)).toBe(UNKNOWN_MODEL_PRICE)
    expect(priceOf("")).toBe(UNKNOWN_MODEL_PRICE)
    for (const price of Object.values(MODEL_PRICES)) {
      for (const field of ["input", "output", "cacheRead", "cacheWrite"] as const) {
        expect(UNKNOWN_MODEL_PRICE[field], field).toBeGreaterThanOrEqual(price[field])
      }
    }
    expect(UNKNOWN_MODEL_PRICE).toEqual({
      input: 25,
      output: 125,
      cacheRead: 2.5,
      cacheWrite: 31.25,
    })
  })
})

describe("tokenFloorUsd", () => {
  test("is 0 only when no token was reported", () => {
    expect(tokenFloorUsd(HAIKU, {})).toBe(0)
    expect(tokenFloorUsd(HAIKU, { inputTokens: 0, outputTokens: 0 })).toBe(0)
    expect(tokenFloorUsd(HAIKU, { inputTokens: 1 })).toBe(0.0001)
  })

  test("rounds up to a whole $0.0001 unit, never down", () => {
    // 12,000 x $0.1/M = $0.0012 exactly; one token more is a part of a unit over, so a whole unit.
    expect(tokenFloorUsd(HAIKU, { inputTokens: 12_000 })).toBe(0.0012)
    expect(tokenFloorUsd(HAIKU, { inputTokens: 12_001 })).toBe(0.0013)
  })

  test("prices input, output and both cache counts, cache on top of the input count", () => {
    // 12,039 x 0.1 + 24 x 0.5 + 11,926 x 0.01 + 109 x 0.125 = 1203.9 + 12 + 119.26 + 13.625 per M
    // = 1348.785 units per million... in dollars: $0.001348785 -> $0.0014 rounded up.
    expect(tokenFloorUsd(HAIKU, SPIKE_CALL)).toBe(0.0014)
    // The same call at the unknown-model price: 12,039 x 25 + 24 x 125 + 11,926 x 2.5 + 109 x 31.25
    // = 300,975 + 3,000 + 29,815 + 3,406.25 = 337,196.25 per M -> $0.3372 rounded up.
    expect(tokenFloorUsd(NOT_IN_THE_TABLE, SPIKE_CALL)).toBe(0.3372)
  })

  test("a count that is negative, not finite or not a number is ignored, never negative", () => {
    const junk = {
      inputTokens: -5,
      outputTokens: Number.NaN,
      cacheReadTokens: Number.POSITIVE_INFINITY,
      cacheWriteTokens: "9" as never,
    }
    expect(tokenFloorUsd(HAIKU, junk)).toBe(0)
    expect(hasTokens(junk)).toBe(false)
    expect(hasTokens({ cacheWriteTokens: 1 })).toBe(true)
  })
})

describe("priceUsage: the zero-cost rule", () => {
  test("a positive reported cost stands as reported, even below the token floor", () => {
    expect(priceUsage(NOT_IN_THE_TABLE, { ...SPIKE_CALL, costUsd: 0.0001313 })).toEqual({
      kind: "reported",
      amountUsd: 0.0001313,
    })
    expect(priceUsage(HAIKU, { costUsd: 0.03 })).toEqual({ kind: "reported", amountUsd: 0.03 })
  })

  test("a reported zero on a call with tokens is charged at the token floor, not zero", () => {
    expect(priceUsage(HAIKU, SPIKE_CALL)).toEqual({ kind: "floor", amountUsd: 0.0014 })
    expect(priceUsage(NOT_IN_THE_TABLE, { costUsd: 0, inputTokens: 12_000 })).toEqual({
      kind: "floor",
      amountUsd: 0.3,
    })
  })

  test("a missing cost on a call with tokens is unreported, carrying its token floor", () => {
    expect(priceUsage(NOT_IN_THE_TABLE, { inputTokens: 12_000 })).toEqual({
      kind: "unreported",
      floorUsd: 0.3,
    })
  })

  test("a zero or missing cost with no tokens is unreported (the estimate stands), not free", () => {
    for (const usage of [
      {},
      { costUsd: 0 },
      { costUsd: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    ]) {
      expect(priceUsage(HAIKU, usage)).toEqual({ kind: "unreported", floorUsd: 0 })
    }
  })

  test("a cost that is negative or not finite is no cost at all", () => {
    for (const costUsd of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(reportedCost({ costUsd })).toBeUndefined()
      expect(priceUsage(HAIKU, { costUsd, inputTokens: 12_000 })).toEqual({
        kind: "unreported",
        floorUsd: 0.0012,
      })
    }
    expect(reportedCost({ costUsd: "3" })).toBeUndefined()
    expect(reportedCost({ costUsd: 0 })).toBe(0)
  })
})

describe("how many zero-cost turns trip the $10 cap", () => {
  const turnsToTrip = (model: string, turn: Parameters<typeof tokenFloorUsd>[1]) =>
    Math.ceil(10 / tokenFloorUsd(model, turn))

  test("haiku-5.5, 12,000 input tokens a turn: about 8,300 turns, finite not never", () => {
    expect(tokenFloorUsd(HAIKU, { inputTokens: 12_000 })).toBe(0.0012)
    expect(turnsToTrip(HAIKU, { inputTokens: 12_000 })).toBe(8_334)
    // The spike's real call (cache and output counted too) trips it sooner.
    expect(turnsToTrip(HAIKU, SPIKE_CALL)).toBe(7_143)
  })

  test("a model that is not in the table, 12,000 input tokens a turn: the cap trips in 34 turns", () => {
    expect(turnsToTrip(NOT_IN_THE_TABLE, { inputTokens: 12_000 })).toBe(34)
  })
})

describe("the turn estimate is sized for the prompt", () => {
  test("a normal turn is six calls of the 12,000-token prompt plus the reply", () => {
    expect(NORMAL_TURN_TOKENS.inputTokens).toBe(72_000)
    expect(NORMAL_TURN_TOKENS.outputTokens).toBe(3_000)
  })

  test("on haiku-5.5 a normal turn is about a cent, so the 0.10 default governs and covers it", () => {
    // 72,000 x $0.1/M + 3,000 x $0.5/M = $0.0072 + $0.0015, up to a cent.
    expect(normalTurnUsd(MODELS.orchestrator)).toBe(0.01)
    expect(MODELS.orchestrator).toBe(HAIKU)
    expect(turnEstimateUsd()).toBe(DEFAULT_TURN_ESTIMATE_USD)
    expect(turnEstimateUsd()).toBeGreaterThanOrEqual(normalTurnUsd())
  })

  test("a chat model missing from the table raises the estimate to its token price, up to the clamp", () => {
    // 72,000 x $25/M + 3,000 x $125/M = $1.80 + $0.375, up to a cent.
    expect(normalTurnUsd(NOT_IN_THE_TABLE)).toBe(2.18)
    vi.spyOn(MODELS, "orchestrator", "get").mockReturnValue(NOT_IN_THE_TABLE as never)
    try {
      expect(turnEstimateUsd()).toBe(2.18)
    } finally {
      vi.restoreAllMocks()
    }
  })
})
