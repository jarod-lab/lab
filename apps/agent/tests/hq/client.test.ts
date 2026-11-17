import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createHqClient, HqError } from "#lib/hq/client.js"
import { createHqFixture, type HqFixture } from "./hq-fixture.js"

/**
 * The agent's client against hq itself: the real operation registry, auth and ledger on PGlite.
 * A wrong path is a 404, a missing scope a 403, so these also hold the client to the paths
 * hq serves (`/v1/search/entries`, `/v1/proposals`, `/v1/runs`, `/v1/spend/...`).
 */
let hq: HqFixture

beforeAll(async () => {
  hq = await createHqFixture()
}, 60_000)

afterAll(async () => {
  await hq.close()
})

describe("the brain", () => {
  test("proposeEntry creates a pending proposal and writes no entry", async () => {
    const proposed = await hq.client.proposeEntry({
      kind: "fact",
      slug: "pricing",
      title: "Pricing",
      body: { text: "Our price is $49 a seat." },
      reason: "Said in Slack",
    })
    expect(proposed.status).toBe("pending")
    expect(await hq.client.searchEntries({ query: "price seat" })).toEqual([])
    const pending = await hq.asFounder("GET", "/v1/proposals?status=pending")
    expect(pending.body.proposals?.map((p) => p.id)).toContain(proposed.proposalId)
  })

  test("searchEntries and getEntry read what a founder approved", async () => {
    const proposed = await hq.client.proposeEntry({
      kind: "playbook",
      slug: "refunds",
      title: "Refunds",
      body: { text: "Refund within thirty days, no questions." },
      reason: "Founders call",
    })
    const decided = await hq.asFounder("POST", `/v1/proposals/${proposed.proposalId}/decision`, {
      decision: "approve",
    })
    expect(decided.status).toBe(200)

    const hits = await hq.client.searchEntries({ query: "refund thirty days" })
    expect(hits.map((hit) => hit.slug)).toContain("refunds")
    const entry = await hq.client.getEntry({ id: hits[0]?.id ?? "" })
    expect(entry.body.text).toContain("thirty days")
    expect(entry.latestVersion).toBe(1)
  })
})

describe("the agent's key", () => {
  test("cannot decide a proposal, edit an entry or grant spend", async () => {
    const proposed = await hq.client.proposeEntry({
      kind: "fact",
      slug: "trust-check",
      title: "Trust check",
      body: { text: "x" },
      reason: "test",
    })
    const decide = await hq.asAgent("POST", `/v1/proposals/${proposed.proposalId}/decision`, {
      decision: "approve",
    })
    expect(decide.status).toBe(403)
    const edit = await hq.asAgent(
      "POST",
      "/v1/entries/00000000-0000-0000-0000-000000000000/versions",
      {
        title: "t",
        body: { text: "x" },
        baseVersion: 1,
      },
    )
    expect(edit.status).toBe(403)
    const grant = await hq.asAgent("POST", "/v1/spend/grants", { amountUsd: 5, reason: "me" })
    expect(grant.status).toBe(403)
    const stillPending = await hq.asFounder("GET", "/v1/proposals?status=pending")
    expect(stillPending.body.proposals?.map((p) => p.id)).toContain(proposed.proposalId)
  })

  test("a wrong key is refused, and its text is not in the error", async () => {
    const stranger = createHqClient({
      baseUrl: "http://localhost:3100",
      apiKey: "not-a-key-0123456789",
      fetch: hq.fetch,
    })
    const error = await stranger.getSpendAllowance().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(HqError)
    expect((error as HqError).status).toBe(401)
    expect((error as HqError).message).not.toContain("not-a-key")
  })
})

describe("runs and spend", () => {
  test("a run's cost is the sum of what settled and what was recorded against it", async () => {
    hq.newDay()
    const run = await hq.client.recordRun({ task: "chat", trigger: "slack", runner: "eve" })
    const reserved = await hq.client.reserveSpend({ estimateUsd: 0.1, runId: run.id })
    expect("holdId" in reserved).toBe(true)
    if (!("holdId" in reserved)) {
      return
    }
    expect(
      await hq.client.settleSpend({ holdId: reserved.holdId, amountUsd: 0.02, model: "m" }),
    ).toEqual({
      amountUsd: 0.02,
      estimated: false,
    })
    await hq.client.recordSpend({ runId: run.id, source: "build", amountUsd: 0.03, model: "m" })
    await hq.client.finishRun({
      id: run.id,
      outcome: "succeeded",
      summary: { worked: ["turn completed"], failed: [], stop: [] },
    })
    const runs = await hq.asAgent("GET", "/v1/runs")
    const mine = runs.body.runs?.find((r) => r.id === run.id)
    expect(mine?.costUsd).toBeCloseTo(0.05, 4)
  })

  test("a second settle of the same hold is a CONFLICT and records nothing", async () => {
    hq.newDay()
    const reserved = await hq.client.reserveSpend({ estimateUsd: 0.1 })
    if (!("holdId" in reserved)) {
      throw new Error("expected a hold")
    }
    await hq.client.settleSpend({ holdId: reserved.holdId, amountUsd: 0.01, model: "m" })
    const again = await hq.client
      .settleSpend({ holdId: reserved.holdId, amountUsd: 0.01, model: "m" })
      .catch((e: unknown) => e)
    expect(again).toBeInstanceOf(HqError)
    expect((again as HqError).code).toBe("CONFLICT")
    const allowance = await hq.client.getSpendAllowance()
    expect(allowance.spentUsd).toBeCloseTo(0.01, 4)
  })

  test("an unreachable hq is an UNREACHABLE error, not a hang", async () => {
    const down = createHqClient({
      baseUrl: "http://localhost:3100",
      apiKey: "k",
      fetch: () => Promise.reject(new Error("connect ECONNREFUSED")),
    })
    const error = await down.getSpendAllowance().catch((e: unknown) => e)
    expect((error as HqError).code).toBe("UNREACHABLE")
  })
})
