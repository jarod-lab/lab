// The billing plans come from STRIPE_PLANS (JSON), never from code: the price ids are the app's own, from
// its Stripe test dashboard. Parsed once at startup, so a malformed list stops the server with a clear message.

export interface StripePlanConfig {
  name: string
  priceId: string
}

const isPlan = (value: unknown): value is StripePlanConfig =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as StripePlanConfig).name === "string" &&
  (value as StripePlanConfig).name.trim() !== "" &&
  typeof (value as StripePlanConfig).priceId === "string" &&
  (value as StripePlanConfig).priceId.trim() !== ""

export function parseStripePlans(value: string | undefined): StripePlanConfig[] {
  if (!value) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('STRIPE_PLANS must be JSON, e.g. [{"name":"pro","priceId":"price_..."}]')
  }
  if (!Array.isArray(parsed) || !parsed.every(isPlan)) {
    throw new Error('STRIPE_PLANS must be an array of {"name": string, "priceId": string} objects')
  }
  return parsed
}
