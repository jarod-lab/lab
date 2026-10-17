import { beforeEach, describe, expect, it, vi } from "vitest"

import type { createClient } from "@starter/auth/client"

import { chooseBillingAdapter } from "./select"

// getBillingAdapter's client is created inside the module, so the test swaps the factory.
vi.mock("@starter/auth/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@starter/auth/client")>()),
  createClient: vi.fn(),
}))

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

describe("getBillingAdapter", () => {
  // The adapter is cached for the browser session in the module, so each test loads a fresh module.
  beforeEach(() => {
    vi.resetModules()
  })

  it("does not keep a failed check: the next call asks the server again", async () => {
    const { createClient } = await import("@starter/auth/client")
    const { getBillingAdapter } = await import("./select")
    const signInMethods = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue({ data: { stripe: true }, error: null })
    vi.mocked(createClient).mockReturnValue({
      signInMethods,
      subscription: {},
    } as unknown as ReturnType<typeof createClient>)
    await expect(getBillingAdapter()).rejects.toThrow()
    expect((await getBillingAdapter()).mode).toBe("stripe")
    expect((await getBillingAdapter()).mode).toBe("stripe")
    // The successful answer is kept: the third call never asked.
    expect(signInMethods).toHaveBeenCalledTimes(2)
  })

  it("keeps the fixture the server chose, since that answer is not a failure", async () => {
    const { createClient } = await import("@starter/auth/client")
    const { getBillingAdapter } = await import("./select")
    const signInMethods = vi.fn(async () => ({ data: { stripe: false }, error: null }))
    vi.mocked(createClient).mockReturnValue({
      signInMethods,
      subscription: {},
    } as unknown as ReturnType<typeof createClient>)
    expect((await getBillingAdapter()).mode).toBe("fixture")
    expect((await getBillingAdapter()).mode).toBe("fixture")
    expect(signInMethods).toHaveBeenCalledTimes(1)
  })
})
