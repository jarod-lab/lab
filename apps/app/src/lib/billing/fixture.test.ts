import { describe, expect, it } from "vitest"

import { NOT_CONNECTED_REASON, PRICE_PLACEHOLDER, SAMPLE_LABEL } from "./adapter"
import { BillingNotConnectedError } from "./adapter"
import { fixtureBillingAdapter, fixtureSnapshot } from "./fixture"

describe("fixtureBillingAdapter", () => {
  it("is the fixture mode and every snapshot is labelled sample data", async () => {
    expect(fixtureBillingAdapter.mode).toBe("fixture")
    const snapshot = await fixtureBillingAdapter.load("org-a")
    expect(snapshot.sample).toBe(true)
    expect(SAMPLE_LABEL).toBe("[SAMPLE DATA]")
  })

  it("never shows a real price or a real amount: the placeholders stay", () => {
    const snapshot = fixtureSnapshot()
    for (const plan of snapshot.plans) expect(plan.price).toBe(PRICE_PLACEHOLDER)
    for (const invoice of snapshot.invoices ?? []) expect(invoice.amount).toBe("[AMOUNT]")
    expect(snapshot.subscription?.renewsOn).toBe("[RENEWAL DATE]")
  })

  it("matches the board: Pro is current, with three paid invoices and a card on file", () => {
    const snapshot = fixtureSnapshot()
    expect(snapshot.plans.map((plan) => plan.name)).toEqual(["Free", "Pro", "Team"])
    expect(snapshot.subscription?.planId).toBe("pro")
    expect(snapshot.paymentMethod).toBe("Card ending 4242 · expires 08/28")
    expect(snapshot.invoices?.map((invoice) => invoice.date)).toEqual([
      "Oct 1, 2026",
      "Sep 1, 2026",
      "Aug 1, 2026",
    ])
  })

  it("hands out a fresh copy, so a caller can't change the fixture", () => {
    const first = fixtureSnapshot()
    first.plans[0]?.features.push("changed")
    first.invoices?.pop()
    const second = fixtureSnapshot()
    expect(second.plans[0]?.features).toEqual(["3 seats · 2 agents · community support"])
    expect(second.invoices).toHaveLength(3)
  })

  it("refuses every change, so nothing is charged from the fixture", async () => {
    await expect(fixtureBillingAdapter.openPortal("org-a")).rejects.toBeInstanceOf(
      BillingNotConnectedError,
    )
    await expect(fixtureBillingAdapter.changePlan("org-a", "team")).rejects.toThrow(
      NOT_CONNECTED_REASON,
    )
    await expect(fixtureBillingAdapter.cancel("org-a")).rejects.toThrow(NOT_CONNECTED_REASON)
  })
})
