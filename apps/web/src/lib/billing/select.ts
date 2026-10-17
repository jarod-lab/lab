import { createClient } from "@starter/auth/client"

import type { BillingAdapter } from "./adapter"
import { fixtureBillingAdapter } from "./fixture"
import { createStripeBillingAdapter } from "./stripe"

type Client = ReturnType<typeof createClient>

/**
 * Chooses the billing adapter from the server's `GET /api/auth/sign-in-methods` answer: the Stripe
 * adapter only when the server reports `stripe: true`. A failed call, a missing flag or an
 * unexpected body all fall back to the fixture, so the page always has something honest to show.
 */
export async function chooseBillingAdapter(
  client: Client,
  options: { returnUrl?: () => string } = {},
): Promise<BillingAdapter> {
  try {
    const result = await client.signInMethods()
    if (result.error || result.data?.stripe !== true) return fixtureBillingAdapter
    return createStripeBillingAdapter(client, options)
  } catch {
    return fixtureBillingAdapter
  }
}

let shared: Promise<BillingAdapter> | undefined

/** The page's adapter, chosen once per browser session. */
export function getBillingAdapter(): Promise<BillingAdapter> {
  shared ??= chooseBillingAdapter(
    createClient(typeof window === "undefined" ? undefined : window.location.origin),
  )
  return shared
}
