import { defineEval } from "eve/evals"
import { satisfies } from "eve/evals/expect"
import { allowance, freshDay, latestRun, OFFLINE_TAG } from "../offline.js"

export default defineEval({
  description:
    "A turn whose model call reports no cost settles at the estimate, marked estimated, and its hold is closed.",
  tags: [OFFLINE_TAG],
  async test(t) {
    await freshDay()

    await t.send("What time is it in Lisbon?")
    t.succeeded()

    // The scripted model reports tokens and no costUsd, so hq charges the turn's estimate.
    const today = await allowance()
    t.check(
      today.reservedUsd,
      satisfies((n: number) => n === 0, "the hold is closed"),
    )
    t.check(
      today.spentUsd,
      satisfies((n: number) => Math.abs(n - 0.1) < 1e-6, "settled at the 0.10 estimate"),
    )
    const run = await latestRun()
    t.check(
      run?.costEstimated,
      satisfies((e) => e === true, "marked estimated"),
    )
    t.check(
      run?.outcome,
      satisfies((o) => o === "succeeded", "the run is logged succeeded"),
    )
  },
})
