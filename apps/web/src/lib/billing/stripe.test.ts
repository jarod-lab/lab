import { describe, expect, it, vi } from "vitest"

import type { createClient } from "@starter/auth/client"

import { createStripeBillingAdapter } from "./stripe"

type Client = ReturnType<typeof createClient>

function fakeClient(subscription: Record<string, unknown>): Client {
  return { subscription } as unknown as Client
}

describe("createStripeBillingAdapter", () => {
  it("is the stripe mode, not labelled as sample data", async () => {
    const adapter = createStripeBillingAdapter(
      fakeClient({ list: vi.fn(async () => ({ data: [], error: null })) }),
    )
    expect(adapter.mode).toBe("stripe")
    const snapshot = await adapter.load("org-a")
    expect(snapshot.sample).toBe(false)
    expect(snapshot.subscription).toBeNull()
    expect(snapshot.invoices).toBeNull()
  })

  it("maps the organization's active subscription, with its renewal date and seats", async () => {
    const list = vi.fn(async () => ({
      data: [
        {
          plan: "pro",
          status: "active",
          periodEnd: new Date("2026-11-16T12:00:00Z"),
          seats: 15,
          cancelAtPeriodEnd: false,
        },
      ],
      error: null,
    }))
    const adapter = createStripeBillingAdapter(fakeClient({ list }))
    const snapshot = await adapter.load("org-a")
    expect(list).toHaveBeenCalledWith({
      query: { referenceId: "org-a", customerType: "organization" },
    })
    expect(snapshot.subscription).toEqual({
      planId: "pro",
      renewsOn: "Nov 16, 2026",
      seats: 15,
      cancelAtPeriodEnd: false,
    })
    expect(snapshot.plans).toEqual([
      { id: "pro", name: "Pro", price: null, perSeat: false, features: [], seatCap: null },
    ])
  })

  it("ignores a canceled subscription: the organization has no paid plan", async () => {
    const adapter = createStripeBillingAdapter(
      fakeClient({
        list: vi.fn(async () => ({ data: [{ plan: "pro", status: "canceled" }], error: null })),
      }),
    )
    expect((await adapter.load("org-a")).subscription).toBeNull()
  })

  it("returns the provider's page for the portal, the plan change and the cancellation", async () => {
    const billingPortal = vi.fn(async () => ({
      data: { url: "https://billing.test/portal" },
      error: null,
    }))
    const upgrade = vi.fn(async () => ({
      data: { url: "https://billing.test/checkout" },
      error: null,
    }))
    const cancel = vi.fn(async () => ({
      data: { url: "https://billing.test/cancel" },
      error: null,
    }))
    const adapter = createStripeBillingAdapter(fakeClient({ billingPortal, upgrade, cancel }), {
      returnUrl: () => "https://app.test/acme/settings/billing",
    })

    expect(await adapter.openPortal("org-a")).toEqual({ url: "https://billing.test/portal" })
    expect(billingPortal).toHaveBeenCalledWith({
      referenceId: "org-a",
      customerType: "organization",
      returnUrl: "https://app.test/acme/settings/billing",
      disableRedirect: true,
    })

    expect(await adapter.changePlan("org-a", "team")).toEqual({
      url: "https://billing.test/checkout",
    })
    expect(upgrade).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "team", disableRedirect: true }),
    )

    expect(await adapter.cancel("org-a")).toEqual({ url: "https://billing.test/cancel" })
  })

  it("throws the server's message when a call is refused", async () => {
    const adapter = createStripeBillingAdapter(
      fakeClient({
        list: vi.fn(async () => ({ data: null, error: { message: "Only the owner" } })),
      }),
    )
    await expect(adapter.load("org-a")).rejects.toThrow("Only the owner")
  })
})
