import { describe, expect, it, vi } from "vitest"

import type { createClient } from "@starter/auth/client"

import { chooseBillingAdapter } from "./select"

type Client = ReturnType<typeof createClient>

function fakeClient(signInMethods: () => Promise<unknown>): Client {
  return { signInMethods, subscription: {} } as unknown as Client
}

describe("chooseBillingAdapter", () => {
  it("uses the stripe adapter when the server reports stripe mounted", async () => {
    const adapter = await chooseBillingAdapter(
      fakeClient(async () => ({ data: { stripe: true }, error: null })),
    )
    expect(adapter.mode).toBe("stripe")
  })

  it("uses the fixture when the server reports stripe off", async () => {
    const adapter = await chooseBillingAdapter(
      fakeClient(async () => ({ data: { stripe: false }, error: null })),
    )
    expect(adapter.mode).toBe("fixture")
  })

  it("falls back to the fixture when the call fails or the body has no flag", async () => {
    const failed = await chooseBillingAdapter(
      fakeClient(async () => ({ data: null, error: { message: "down" } })),
    )
    expect(failed.mode).toBe("fixture")
    const noFlag = await chooseBillingAdapter(fakeClient(async () => ({ data: {}, error: null })))
    expect(noFlag.mode).toBe("fixture")
    const threw = await chooseBillingAdapter(
      fakeClient(
        vi.fn(async () => {
          throw new Error("network")
        }),
      ),
    )
    expect(threw.mode).toBe("fixture")
  })
})
