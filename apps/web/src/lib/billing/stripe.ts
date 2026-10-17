import type { createClient } from "@starter/auth/client"

import { fetchBillingUsage } from "./usage"
import {
  type BillingAdapter,
  type BillingRedirect,
  type BillingSnapshot,
  type BillingSubscription,
} from "./adapter"

type Client = ReturnType<typeof createClient>

/** The slice of a better-auth stripe subscription row this page reads (stripe 1.7.7 `Subscription`). */
export interface StripeSubscriptionRow {
  plan: string
  status: string
  periodEnd?: Date | string | null
  seats?: number | null
  cancelAtPeriodEnd?: boolean | null
}

/** The `subscription` namespace of the stripe client, typed for the calls this adapter makes. */
export interface StripeSubscriptionApi {
  list(args: { query: { referenceId: string; customerType: "organization" } }): Promise<{
    data: StripeSubscriptionRow[] | null
    error: { message?: string } | null
  }>
  upgrade(args: {
    plan: string
    referenceId: string
    customerType: "organization"
    successUrl: string
    cancelUrl: string
    returnUrl: string
    disableRedirect: true
  }): Promise<{ data: BillingRedirect | null; error: { message?: string } | null }>
  cancel(args: {
    referenceId: string
    customerType: "organization"
    returnUrl: string
    disableRedirect: true
  }): Promise<{ data: BillingRedirect | null; error: { message?: string } | null }>
  billingPortal(args: {
    referenceId: string
    customerType: "organization"
    returnUrl: string
    disableRedirect: true
  }): Promise<{ data: BillingRedirect | null; error: { message?: string } | null }>
}

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
  const subscription = client.subscription as unknown as StripeSubscriptionApi
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
