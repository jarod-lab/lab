import { organizationFetch } from "../org-api"
import { WebError } from "../web-auth"
import type { BillingUsage } from "./adapter"

/**
 * Today's metered requests for one organization, from `GET /v1/whoami`. The call names the
 * organization in `X-Organization-Id`, so the server answers for the org the page shows. Both
 * billing adapters use this: the usage counter is the API's own, not the provider's.
 */
export async function fetchBillingUsage(organizationId: string): Promise<BillingUsage> {
  const request = organizationFetch(organizationId)
  const response = await request("/v1/whoami", {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string }
    } | null
    throw new WebError(body?.error?.message ?? "Could not load today's usage", response.status)
  }
  const body = (await response.json()) as { usage: BillingUsage }
  return { day: body.usage.day, total: body.usage.total, limit: body.usage.limit }
}
