// The billing page's contract. The page reads and changes an organization's plan through this
// interface only: the fixture adapter answers until Stripe is configured, and the Stripe adapter
// (stripe.ts) answers through better-auth's stripe client. Nothing here reads a price or a limit
// from anywhere but the adapter that owns it.

/** The price placeholder the board uses until a real price exists. Never replace it with a number. */
export const PRICE_PLACEHOLDER = "[PRICE]"

/** The label every fixture value carries, as the board does for DirLift. */
export const SAMPLE_LABEL = "[SAMPLE DATA]"

/** Shown on every disabled action while billing is not connected. */
export const NOT_CONNECTED_REASON = "Billing isn't connected yet"

export type BillingMode = "fixture" | "stripe"

export interface BillingPlan {
  id: string
  name: string
  /** `PRICE_PLACEHOLDER` in the fixture; null when the adapter has no price to show. */
  price: string | null
  /** The price is charged per seat (the board's "[PRICE] / seat"). */
  perSeat: boolean
  /** Plan copy as the board words it (feature lines). Empty when the adapter has none. */
  features: string[]
  /** The most seats the plan allows, when the plan states one. */
  seatCap: number | null
}

export interface BillingSubscription {
  planId: string
  /** The renewal date as display text, or `[RENEWAL DATE]` in the fixture. */
  renewsOn: string | null
  /** Seats the organization pays for. Null when unknown. */
  seats: number | null
  cancelAtPeriodEnd: boolean
}

export type BillingInvoiceStatus = "paid" | "open" | "void" | "draft" | "uncollectible"

export interface BillingInvoice {
  id: string
  /** Display text, e.g. "Oct 1, 2026". */
  date: string
  status: BillingInvoiceStatus
  /** `[AMOUNT]` in the fixture; null when the adapter has no amount. */
  amount: string | null
  /** The hosted invoice page, when the provider has one. */
  url: string | null
}

export interface BillingSnapshot {
  /** True when every value is fixture data (labelled on the page). */
  sample: boolean
  plans: BillingPlan[]
  /** Null when the organization has no paid subscription. */
  subscription: BillingSubscription | null
  /** Display text such as "Card ending 4242 · expires 08/28"; null when the adapter can't read it. */
  paymentMethod: string | null
  /** Where invoices are sent; null when the adapter can't read it. */
  invoiceEmail: string | null
  /** Null when the adapter can't list invoices (the page then links to the provider's portal). */
  invoices: BillingInvoice[] | null
}

/**
 * Requests the organization has made today (UTC), against its daily limit. Real: metered by the API,
 * not sample data, so the page doesn't label it.
 */
export interface BillingUsage {
  /** The UTC day the counter covers (YYYY-MM-DD). */
  day: string
  total: number
  /** Requests allowed per day; null when the plan is unlimited (Team). */
  limit: number | null
  /** The plan the API enforces (whoami's `entitlements`), the same in both modes. */
  plan?: BillingEntitlements
}

/** What the organization's plan allows, as the API enforces it. Real data, never a sample. */
export interface BillingEntitlements {
  planId: string
  /** The plan's name from the catalog ("Free"). */
  planName: string
  /** Seats the plan allows (viewers are free); null when unlimited. */
  seatLimit: number | null
  /** Workspace agents the plan allows; null when unlimited. */
  agentLimit: number | null
  /** The plan could not be read; this is Free as a fallback. */
  degraded: boolean
}

/** A change that the provider completes on its own page: the URL to open in a new tab. */
export interface BillingRedirect {
  url: string | null
}

export interface BillingAdapter {
  readonly mode: BillingMode
  /** The organization's billing state. Every call names the organization. */
  load(organizationId: string): Promise<BillingSnapshot>
  /** Today's metered requests and the daily limit (from the API in both modes). */
  usage(organizationId: string): Promise<BillingUsage>
  /** The provider's customer portal: payment method, billing email, invoices, cancellation. */
  openPortal(organizationId: string): Promise<BillingRedirect>
  /** Start a checkout or plan change for `planId` (the provider confirms it). */
  changePlan(organizationId: string, planId: string): Promise<BillingRedirect>
  /** Cancel at the end of the period (the provider confirms it on its own page). */
  cancel(organizationId: string): Promise<BillingRedirect>
  /**
   * Re-read the plan from the provider now (the page calls it on return from checkout, as the
   * webhook may arrive later). Absent when there is no provider.
   */
  refresh?(organizationId: string): Promise<void>
}

/** The query parameter the checkout's success page carries back (`?checkout=success`). */
export const CHECKOUT_RETURN_PARAM = "checkout"

/** Thrown by any fixture action: nothing can be charged or changed without a provider. */
export class BillingNotConnectedError extends Error {
  constructor() {
    super(NOT_CONNECTED_REASON)
    this.name = "BillingNotConnectedError"
  }
}
