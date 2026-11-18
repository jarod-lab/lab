/**
 * What a model call costs by its tokens: the floor under a cost the provider reports as zero.
 *
 * @remarks
 * The spend cap is only as good as the cost it is fed, and the gateway reported `costUsd: 0` on
 * every anthropic/claude-haiku-5.5 call (the real-service spike), whatever the tokens. Taken at face
 * value a zero cost never settles a hold above $0.00, so the $10/day cap could never trip. The rule
 * (it is the same wherever a cost is read):
 *
 * - A positive, finite reported cost stands as reported.
 * - A reported cost of 0, or none, on a call that used tokens is never taken as free: it is priced
 *   at the token floor below. A zero settles at the floor itself; a missing cost settles at the
 *   larger of the turn's estimate and the floor (the existing "missing cost settles at the
 *   estimate" rule can only go up).
 * - A reported 0, or none, with no positive token count is an unreported cost, not a free call (eve
 *   fills every count with 0 when the provider reported none): the turn's estimate stands.
 *
 * Prices are US dollars per million tokens, converted to integer money units ($0.0001, hq's unit)
 * and rounded up, never down. A model not in the table is priced at `UNKNOWN_MODEL_PRICE`, which is
 * deliberately above any model we run: an unknown price is a reason to hold more, not less. Cache
 * tokens are priced on top of `inputTokens` and never discounted out of it: whether a provider
 * counts cached tokens inside its input count differs, and counting them twice only errs high.
 */

/** One money unit is $0.0001, the unit hq's ledger stores. */
const UNITS_PER_USD = 10_000

const TOKENS_PER_PRICE = 1_000_000

/** US dollars per million tokens. */
export interface ModelPrice {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/**
 * The price table, by gateway model id, at the gateway's LIST price. It is a table of list prices
 * and must be re-checked against the gateway whenever a model is added or changed: a stale entry
 * makes the floor, and so the cap, misreport spend to founders.
 *
 * `anthropic/claude-haiku-5.5` is listed at $0.1 in / $0.5 out per million tokens (the spike read it
 * off the gateway's model list), with cache reads at a tenth of input and writes at 1.25x. The
 * gateway nevertheless reported it as free ($0, and its own credit counter agreed): why is not
 * established, so the floor charges the list price instead of trusting the zero. Every other model
 * we run (decision, reviewer, implementer, researcher, analyst) has no entry yet and is priced at
 * `UNKNOWN_MODEL_PRICE` until someone enters its real list price here.
 */
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "anthropic/claude-haiku-5.5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
}

/**
 * What an unlisted model is priced at: above any model we run, so a forgotten or renamed model
 * errs towards counting too much; the list price applies to models in the table only. Cache reads at a tenth of input and writes at 1.25x, as the
 * Anthropic family prices them.
 */
export const UNKNOWN_MODEL_PRICE: ModelPrice = {
  input: 25,
  output: 125,
  cacheRead: 2.5,
  cacheWrite: 31.25,
}

/** The price a model's tokens are floored at: its table entry, else the unknown-model price. */
export function priceOf(model: string): ModelPrice {
  return MODEL_PRICES[model.trim().toLowerCase()] ?? UNKNOWN_MODEL_PRICE
}

/** The token counts of one usage record; any may be missing or garbage (it counts as zero). */
export interface UsageTokens {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

export interface UsageWithCost extends UsageTokens {
  costUsd?: number
}

const count = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0

/** The price in money units per million tokens (an integer), so the arithmetic stays integral. */
const units = (usdPerMillion: number) => Math.round(usdPerMillion * UNITS_PER_USD)

/**
 * The least a call's tokens can have cost at this model's price, in dollars rounded up to a whole
 * money unit ($0.0001). 0 only when no token was reported.
 */
export function tokenFloorUsd(model: string, usage: UsageTokens): number {
  const price = priceOf(model)
  const unitsOwed =
    (count(usage.inputTokens) * units(price.input) +
      count(usage.outputTokens) * units(price.output) +
      count(usage.cacheReadTokens) * units(price.cacheRead) +
      count(usage.cacheWriteTokens) * units(price.cacheWrite)) /
    TOKENS_PER_PRICE
  // Exact for whole token counts (an integer over a power of ten divides exactly when it divides).
  return Math.max(0, Math.ceil(unitsOwed)) / UNITS_PER_USD
}

/** Whether a usage record reports any token at all. */
export const hasTokens = (usage: UsageTokens): boolean =>
  count(usage.inputTokens) +
    count(usage.outputTokens) +
    count(usage.cacheReadTokens) +
    count(usage.cacheWriteTokens) >
  0

/** A usable reported cost: a finite number, zero or more. Anything else is "none reported". */
export const reportedCost = (usage: { costUsd?: unknown }): number | undefined =>
  typeof usage.costUsd === "number" && Number.isFinite(usage.costUsd) && usage.costUsd >= 0
    ? usage.costUsd
    : undefined

/** How a usage record is to be charged (see the rule above). */
export type PricedUsage =
  /** The provider reported a positive cost: it stands. */
  | { kind: "reported"; amountUsd: number }
  /** The provider reported 0 on a call with tokens: charged at the token floor. */
  | { kind: "floor"; amountUsd: number }
  /**
   * No usable cost (none, or 0 with no tokens): the caller's estimate stands, raised to
   * `floorUsd` when the tokens cost more than the estimate (`floorUsd` is 0 without tokens).
   */
  | { kind: "unreported"; floorUsd: number }

/** Prices one usage record; `model` is the id its tokens are priced at. */
export function priceUsage(model: string, usage: UsageWithCost): PricedUsage {
  const reported = reportedCost(usage)
  if (reported !== undefined && reported > 0) {
    return { kind: "reported", amountUsd: reported }
  }
  const floorUsd = hasTokens(usage) ? tokenFloorUsd(model, usage) : 0
  if (reported === 0 && floorUsd > 0) {
    return { kind: "floor", amountUsd: floorUsd }
  }
  return { kind: "unreported", floorUsd }
}

/**
 * What a normal chat turn is sized at: the Foreman prompt (~12,000 input tokens, seen on every
 * call in the spike) sent on each of about six model calls in a tool loop, and a few thousand
 * tokens written.
 */
export const NORMAL_TURN_TOKENS: Required<UsageTokens> = {
  inputTokens: 6 * 12_000,
  outputTokens: 3_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
}
