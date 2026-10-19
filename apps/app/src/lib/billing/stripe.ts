import type { createClient } from "@starter/auth/client"

import { fetchBillingUsage } from "./usage"
import { type BillingAdapter, type BillingSnapshot, type BillingSubscription } from "./adapter"

type Client = ReturnType<typeof createClient>

export interface StripeBillingOptions {
  /** The page to return to from the provider (defaults to the current address). */
  returnUrl?: () => string
}

const currentPage = () => (typeof window === "undefined" ? "/" : window.location.href)

function unwrap<T>(
  result: { data: T | null; error: { message?: string } | null },
  fallback: string,
): T {
  if (result.error) throw new Error(result.error.message || fallback)
  if (result.data === null) throw new Error(fallback)
  return result.data
}

const dateText = (value: Date | string | null | undefined): string | null => {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date)
}

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

/**
 * The billing adapter over better-auth's stripe client (test mode, server-gated: only chosen when
 * the server reports `stripe: true`). The provider owns the card, the invoices and the
 * cancellation: each change returns a URL, and the page opens it in a new tab.
 *
 * better-auth's stripe client doesn't list invoices or read the card, so those come back null and
 * the page points at the portal for them.
 */
export function createStripeBillingAdapter(
  client: Client,
  options: StripeBillingOptions = {},
): BillingAdapter {
  const subscription = client.subscription
  const here = options.returnUrl ?? currentPage
  return {
    mode: "stripe",
    usage: fetchBillingUsage,
    async load(organizationId) {
      const rows = unwrap(
        await subscription.list({
          query: { referenceId: organizationId, customerType: "organization" },
        }),
        "Could not load the subscription",
      )
      const active = rows.find((row) => row.status === "active" || row.status === "trialing")
      const snapshot: BillingSnapshot = {
        sample: false,
        plans: [],
        subscription: null,
        paymentMethod: null,
        invoiceEmail: null,
        invoices: null,
      }
      if (!active) return snapshot
      // The plan catalogue lives on the server (STRIPE_PLANS) and isn't listed to the browser, so
      // the only plan the page can name is the one the organization holds.
      const current: BillingSubscription = {
        planId: active.plan,
        renewsOn: dateText(active.periodEnd),
        seats: typeof active.seats === "number" ? active.seats : null,
        cancelAtPeriodEnd: active.cancelAtPeriodEnd === true,
      }
      snapshot.subscription = current
      snapshot.plans = [
        {
          id: active.plan,
          name: titleCase(active.plan),
          price: null,
          perSeat: false,
          features: [],
          seatCap: null,
        },
      ]
      return snapshot
    },
    async openPortal(organizationId) {
      const result = unwrap(
        await subscription.billingPortal({
          referenceId: organizationId,
          customerType: "organization",
          returnUrl: here(),
          disableRedirect: true,
        }),
        "Could not open the billing portal",
      )
      return { url: result.url }
    },
    async changePlan(organizationId, planId) {
      const result = unwrap(
        await subscription.upgrade({
          plan: planId,
          referenceId: organizationId,
          customerType: "organization",
          successUrl: here(),
          cancelUrl: here(),
          returnUrl: here(),
          disableRedirect: true,
        }),
        "Could not change the plan",
      )
      return { url: result.url }
    },
    async cancel(organizationId) {
      const result = unwrap(
        await subscription.cancel({
          referenceId: organizationId,
          customerType: "organization",
          returnUrl: here(),
          disableRedirect: true,
        }),
        "Could not cancel the plan",
      )
      return { url: result.url }
    },
  }
}
